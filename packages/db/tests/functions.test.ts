import type { PGlite, Transaction } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, asRole, createSupabasePglite } from '../supabase-pglite';

const SERVICE_FUNCTIONS = [
  `public.create_project('user_x', 'P', 'pk_x', 1)`,
  `public.reserve_knowledge_source(gen_random_uuid(), 'T', 'text', 1)`,
  `public.consume_message(gen_random_uuid(), 1)`,
  `public.save_chat_turn(gen_random_uuid(), null, 'v', 'hi', 'hello')`,
  `public.match_chunks(gen_random_uuid(), array_fill(0.1, array[1536])::extensions.vector)`,
] as const;

let db: PGlite;

beforeAll(async () => {
  db = await createSupabasePglite();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

/** Runs `fn` as service_role, rolled back afterwards. */
function asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return asRole(db, 'service_role', { role: 'service_role' }, fn);
}

/**
 * Asserts a call failed with the API error convention: SQLSTATE P0001 + ErrorCode.
 * Runs it in a savepoint so the transaction stays usable afterwards.
 */
async function expectApiError(tx: Transaction, run: () => Promise<unknown>, code: string) {
  await tx.exec('savepoint expect_api_error');
  const error = await run().then(
    () => null,
    (e: unknown) => e as { code?: string; message?: string },
  );
  await tx.exec('rollback to savepoint expect_api_error');
  expect(error, `expected ${code}`).not.toBeNull();
  expect({ code: error?.code, message: error?.message }).toEqual({ code: 'P0001', message: code });
}

/** A unit vector along one axis, as pgvector text. */
function axis(i: number): string {
  return `[${Array.from({ length: 1536 }, (_, j) => (j === i ? '1' : '0')).join(',')}]`;
}

async function createProject(tx: Transaction, owner: string, key: string, max = 5) {
  const { rows } = await tx.query<{ id: string }>(
    `select id from public.create_project($1, 'Project', $2, $3)`,
    [owner, key, max],
  );
  return rows[0]!.id;
}

/**
 * Source of a public function. pglite has one connection, so a real lock wait
 * can't be shown; and a child row's FK check also locks the parent (KEY SHARE),
 * so xmax can't tell FOR UPDATE apart. The tests read the lock from the SQL.
 */
async function functionSource(name: string): Promise<string> {
  const { rows } = await db.query<{ src: string }>(
    `select regexp_replace(lower(p.prosrc), '\\s+', ' ', 'g') as src
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = $1`,
    [name],
  );
  return rows[0]!.src;
}

describe('function definitions', () => {
  it('are all SECURITY INVOKER with search_path = ""', async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      `select p.proname, p.prosecdef, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([
      'consume_message',
      'create_project',
      'match_chunks',
      'owner_activity',
      'reserve_knowledge_source',
      'save_chat_turn',
    ]);
    for (const row of rows) {
      expect(row.prosecdef, row.proname).toBe(false);
      expect(row.proconfig, row.proname).toContain('search_path=""');
    }
  });
});

describe('permissions', () => {
  it.each(SERVICE_FUNCTIONS)('anon cannot execute %s', async (call) => {
    await expect(
      asRole(db, 'anon', null, (tx) => tx.query(`select * from ${call}`)),
    ).rejects.toThrow(/permission denied for function/);
  });

  it.each(SERVICE_FUNCTIONS)('authenticated cannot execute %s', async (call) => {
    await expect(asOwner(db, 'user_x', (tx) => tx.query(`select * from ${call}`))).rejects.toThrow(
      /permission denied for function/,
    );
  });

  it('anon cannot execute owner_activity', async () => {
    await expect(
      asRole(db, 'anon', null, (tx) =>
        tx.query(`select * from public.owner_activity(gen_random_uuid())`),
      ),
    ).rejects.toThrow(/permission denied for function/);
  });

  it('only service_role and authenticated hold EXECUTE, as intended', async () => {
    const { rows } = await db.query<{ fn: string; role: string; ok: boolean }>(
      `select p.proname as fn, r as role, has_function_privilege(r, p.oid, 'execute') as ok
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            unnest(array['anon', 'authenticated', 'service_role']) r
       where n.nspname = 'public' order by 1, 2`,
    );
    for (const row of rows) {
      const expected =
        row.fn === 'owner_activity' ? row.role === 'authenticated' : row.role === 'service_role';
      expect(row.ok, `${row.role} on ${row.fn}`).toBe(expected);
    }
  });
});

describe('create_project', () => {
  it('creates the account, the project and its default widget config', async () => {
    await asService(async (tx) => {
      const id = await createProject(tx, 'user_new', 'pk_new', 1);
      const account = await tx.query(`select plan from public.accounts where clerk_user_id = 'user_new'`);
      expect(account.rows).toEqual([{ plan: 'free' }]);
      const config = await tx.query(`select position from public.widget_configs where project_id = $1`, [id]);
      expect(config.rows).toEqual([{ position: 'bottom-right' }]);
    });
  });

  it('allows exactly the limit', async () => {
    await asService(async (tx) => {
      await createProject(tx, 'user_a', 'pk_a1', 2);
      await createProject(tx, 'user_a', 'pk_a2', 2);
      await expectApiError(tx, () => createProject(tx, 'user_a', 'pk_a3', 2), 'limit_reached');
      // Another owner has their own count.
      await createProject(tx, 'user_b', 'pk_b1', 2);
    });
  });

  it('refuses everything at limit 0, and a negative limit', async () => {
    await asService(async (tx) => {
      await expectApiError(tx, () => createProject(tx, 'user_a', 'pk_z', 0), 'limit_reached');
    });
    await asService(async (tx) => {
      await expectApiError(tx, () => createProject(tx, 'user_a', 'pk_z', -1), 'invalid_input');
    });
  });

  it("locks the owner's account row before it counts", async () => {
    const src = await functionSource('create_project');
    const lock = src.indexOf('from public.accounts a where a.clerk_user_id = p_owner_id for update');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(src.indexOf('count(*)'));
  });

  it('two calls racing for the last slot: only one passes', async () => {
    await asService(async (tx) => {
      await createProject(tx, 'user_a', 'pk_r0', 2);
      const results = await Promise.allSettled([
        createProject(tx, 'user_a', 'pk_r1', 2),
        createProject(tx, 'user_a', 'pk_r2', 2),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    });
  });
});

describe('reserve_knowledge_source', () => {
  async function reserve(tx: Transaction, projectId: string, type: string, max: number, ttl?: string) {
    const { rows } = await tx.query<{ id: string; status: string; storage_key: string | null }>(
      ttl
        ? `select * from public.reserve_knowledge_source($1, 'Doc', $2, $3, $4::interval)`
        : `select * from public.reserve_knowledge_source($1, 'Doc', $2, $3)`,
      ttl ? [projectId, type, max, ttl] : [projectId, type, max],
    );
    return rows[0]!;
  }

  it('starts pasted text as processing and a file as uploading with a storage key', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k1');
      const text = await reserve(tx, projectId, 'text', 5);
      expect(text).toMatchObject({ status: 'processing', storage_key: null });
      const pdf = await reserve(tx, projectId, 'pdf', 5);
      expect(pdf).toMatchObject({ status: 'uploading', storage_key: `${projectId}/${pdf.id}.pdf` });
    });
  });

  it('allows exactly the limit, files and text together', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k2');
      await reserve(tx, projectId, 'text', 2);
      await reserve(tx, projectId, 'md', 2);
      await expectApiError(tx, () => reserve(tx, projectId, 'txt', 2), 'limit_reached');
    });
  });

  it('stops counting an upload reservation once it is ttl old, not before', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k3');
      const stale = await reserve(tx, projectId, 'pdf', 1);
      // now() is fixed within the transaction, so these ages are exact.
      await tx.query(
        `update public.knowledge_sources set created_at = now() - interval '2 hours' + interval '1 second' where id = $1`,
        [stale.id],
      );
      await expectApiError(tx, () => reserve(tx, projectId, 'pdf', 1), 'limit_reached');
      await tx.query(
        `update public.knowledge_sources set created_at = now() - interval '2 hours' where id = $1`,
        [stale.id],
      );
      await reserve(tx, projectId, 'pdf', 1);
    });
  });

  it('takes the ttl as a parameter', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k4');
      const first = await reserve(tx, projectId, 'pdf', 1);
      await tx.query(
        `update public.knowledge_sources set created_at = now() - interval '10 minutes' where id = $1`,
        [first.id],
      );
      await expectApiError(tx, () => reserve(tx, projectId, 'pdf', 1), 'limit_reached');
      await reserve(tx, projectId, 'pdf', 1, '10 minutes');
    });
  });

  it('does not let old sources that are not uploading escape the count', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k5');
      const source = await reserve(tx, projectId, 'text', 1);
      await tx.query(
        `update public.knowledge_sources set created_at = now() - interval '1 day' where id = $1`,
        [source.id],
      );
      await expectApiError(tx, () => reserve(tx, projectId, 'text', 1), 'limit_reached');
    });
  });

  it('refuses an unknown project and bad parameters', async () => {
    await asService(async (tx) => {
      await expectApiError(tx, () => reserve(tx, '00000000-0000-4000-8000-000000000000', 'text', 5), 'not_found');
    });
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k6');
      await expectApiError(tx, () => reserve(tx, projectId, 'text', -1), 'invalid_input');
    });
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k7');
      await expectApiError(tx, () => reserve(tx, projectId, 'text', 5, '0 seconds'), 'invalid_input');
    });
  });

  it('locks the project row before it counts', async () => {
    const src = await functionSource('reserve_knowledge_source');
    const lock = src.indexOf('from public.projects p where p.id = p_project_id for update');
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(src.indexOf('count(*)'));
  });

  it('two calls racing for the last slot: only one passes', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_k9');
      const results = await Promise.allSettled([
        reserve(tx, projectId, 'pdf', 1),
        reserve(tx, projectId, 'pdf', 1),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    });
  });
});

describe('consume_message', () => {
  async function consume(tx: Transaction, projectId: string, limit: number) {
    const { rows } = await tx.query<{ used: number }>(
      `select public.consume_message($1, $2) as used`,
      [projectId, limit],
    );
    return rows[0]!.used;
  }

  it('counts up to exactly the limit, then refuses', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m1');
      expect(await consume(tx, projectId, 3)).toBe(1);
      expect(await consume(tx, projectId, 3)).toBe(2);
      expect(await consume(tx, projectId, 3)).toBe(3);
      await expectApiError(tx, () => consume(tx, projectId, 3), 'quota_exceeded');
      const { rows } = await tx.query(`select messages_used from public.projects where id = $1`, [projectId]);
      expect(rows).toEqual([{ messages_used: 3 }]);
    });
  });

  it('resets in a new UTC month and moves period_start to the month start', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m2');
      await tx.query(
        `update public.projects
         set messages_used = 3, period_start = date_trunc('month', now(), 'UTC') - interval '1 second'
         where id = $1`,
        [projectId],
      );
      expect(await consume(tx, projectId, 3)).toBe(1);
      const { rows } = await tx.query<{ ok: boolean }>(
        `select period_start = date_trunc('month', now(), 'UTC') as ok from public.projects where id = $1`,
        [projectId],
      );
      expect(rows).toEqual([{ ok: true }]);
    });
  });

  it('does not reset within the same month', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m3');
      await tx.query(
        `update public.projects set messages_used = 3, period_start = date_trunc('month', now(), 'UTC')
         where id = $1`,
        [projectId],
      );
      await expectApiError(tx, () => consume(tx, projectId, 3), 'quota_exceeded');
    });
  });

  it('refuses an unknown project, limit 0 and a negative limit', async () => {
    await asService(async (tx) => {
      await expectApiError(tx, () => consume(tx, '00000000-0000-4000-8000-000000000000', 3), 'not_found');
    });
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m4');
      await expectApiError(tx, () => consume(tx, projectId, 0), 'quota_exceeded');
    });
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m5');
      await expectApiError(tx, () => consume(tx, projectId, -1), 'invalid_input');
    });
  });

  it('checks the quota and counts in one UPDATE', async () => {
    const src = await functionSource('consume_message');
    expect(src).toMatch(
      /update public\.projects p set messages_used = .* where p\.id = p_project_id and \(case .* end\) < p_limit returning/,
    );
  });

  it('two calls racing for the last message: only one passes', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_m6');
      await consume(tx, projectId, 2);
      const results = await Promise.allSettled([consume(tx, projectId, 2), consume(tx, projectId, 2)]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    });
  });
});

describe('save_chat_turn', () => {
  async function save(tx: Transaction, projectId: string, conversationId: string | null) {
    const { rows } = await tx.query<{ id: string }>(
      `select public.save_chat_turn($1, $2, 'visitor_1', 'Question?', 'Answer.') as id`,
      [projectId, conversationId],
    );
    return rows[0]!.id;
  }

  it('starts a conversation, then appends to it in order', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_c1');
      const conversationId = await save(tx, projectId, null);
      expect(await save(tx, projectId, conversationId)).toBe(conversationId);
      const { rows } = await tx.query(
        `select role, body from public.messages where conversation_id = $1 order by created_at, id`,
        [conversationId],
      );
      expect(rows).toEqual([
        { role: 'visitor', body: 'Question?' },
        { role: 'bot', body: 'Answer.' },
        { role: 'visitor', body: 'Question?' },
        { role: 'bot', body: 'Answer.' },
      ]);
    });
  });

  it("refuses another project's conversation and saves nothing", async () => {
    await asService(async (tx) => {
      const projectA = await createProject(tx, 'user_a', 'pk_c2');
      const projectB = await createProject(tx, 'user_b', 'pk_c3');
      const conversationB = await save(tx, projectB, null);
      await expectApiError(tx, () => save(tx, projectA, conversationB), 'not_found');
    });
    await asService(async (tx) => {
      const projectA = await createProject(tx, 'user_a', 'pk_c4');
      await expectApiError(tx, () => save(tx, projectA, '00000000-0000-4000-8000-000000000000'), 'not_found');
      const { rows } = await tx.query(`select count(*)::int as n from public.messages`);
      expect(rows).toEqual([{ n: 0 }]);
    });
  });
});

describe('match_chunks', () => {
  async function addChunk(
    tx: Transaction,
    projectId: string,
    content: string,
    axisIndex: number,
    status = 'ready',
  ) {
    const { rows } = await tx.query<{ id: string }>(
      `select id from public.reserve_knowledge_source($1, $2, 'text', 100)`,
      [projectId, content],
    );
    const sourceId = rows[0]!.id;
    await tx.query(`update public.knowledge_sources set status = $2 where id = $1`, [sourceId, status]);
    await tx.query(
      `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
       values ($1, $2, $3, $4)`,
      [projectId, sourceId, content, axis(axisIndex)],
    );
  }

  async function match(tx: Transaction, projectId: string, axisIndex: number, count = 5) {
    const { rows } = await tx.query<{ content: string; similarity: number }>(
      `select content, similarity from public.match_chunks($1, $2::extensions.vector, $3)`,
      [projectId, axis(axisIndex), count],
    );
    return rows;
  }

  it("never returns another project's chunks, even an exact match", async () => {
    await asService(async (tx) => {
      const projectA = await createProject(tx, 'user_a', 'pk_v1');
      const projectB = await createProject(tx, 'user_b', 'pk_v2');
      await addChunk(tx, projectA, 'A near', 1);
      await addChunk(tx, projectB, 'B exact', 0);
      const rows = await match(tx, projectA, 0);
      expect(rows.map((r) => r.content)).toEqual(['A near']);
    });
  });

  it('returns only ready sources, nearest first, up to the count', async () => {
    await asService(async (tx) => {
      const projectId = await createProject(tx, 'user_a', 'pk_v3');
      await addChunk(tx, projectId, 'exact', 0);
      await addChunk(tx, projectId, 'other', 1);
      await addChunk(tx, projectId, 'still processing', 0, 'processing');
      await addChunk(tx, projectId, 'failed', 0, 'failed');
      const rows = await match(tx, projectId, 0);
      expect(rows.map((r) => r.content)).toEqual(['exact', 'other']);
      expect(rows[0]!.similarity).toBeCloseTo(1);
      expect(await match(tx, projectId, 0, 1)).toHaveLength(1);
    });
  });

  it('refuses a match count outside 1-50', async () => {
    for (const count of [0, 51]) {
      await asService(async (tx) => {
        const projectId = await createProject(tx, 'user_a', `pk_v4_${count}`);
        await expectApiError(tx, () => match(tx, projectId, 0, count), 'invalid_input');
      });
    }
  });
});

describe('owner_activity', () => {
  it("lists the owner's conversations newest first, and 0 rows for anyone else's", async () => {
    const projectA = '00000000-0000-4000-8000-0000000000aa';
    const projectB = '00000000-0000-4000-8000-0000000000bb';
    const longBody = 'x'.repeat(500);
    await db.transaction(async (tx) => {
      await tx.query(`insert into public.accounts (clerk_user_id) values ('user_a'), ('user_b')`);
      await tx.query(
        `insert into public.projects (id, owner_id, name, public_key)
         values ($1, 'user_a', 'A', 'pk_oa'), ($2, 'user_b', 'B', 'pk_ob')`,
        [projectA, projectB],
      );
      await tx.query(
        `insert into public.conversations (id, project_id, visitor_id, created_at) values
           ('00000000-0000-4000-8000-0000000000c1', $1, 'v', now() - interval '1 hour'),
           ('00000000-0000-4000-8000-0000000000c2', $1, 'v', now()),
           ('00000000-0000-4000-8000-0000000000c3', $2, 'v', now())`,
        [projectA, projectB],
      );
      // Two messages at the same time: the lower id comes first.
      await tx.query(
        `insert into public.messages (id, conversation_id, role, body, created_at) values
           ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000c1', 'bot', 'Second', now()),
           ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000c1', 'visitor', $1, now()),
           ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000c3', 'visitor', 'B secret', now())`,
        [longBody],
      );

      await tx.exec(`select set_config('request.jwt.claims', '{"sub":"user_a"}', true)`);
      await tx.exec(`set local role authenticated`);
      const own = await tx.query(`select * from public.owner_activity($1)`, [projectA]);
      expect(own.rows).toMatchObject([
        { id: '00000000-0000-4000-8000-0000000000c2', first_message_preview: '', message_count: 0 },
        {
          id: '00000000-0000-4000-8000-0000000000c1',
          first_message_preview: 'x'.repeat(140),
          message_count: 2,
        },
      ]);
      const other = await tx.query(`select * from public.owner_activity($1)`, [projectB]);
      expect(other.rows).toEqual([]);
      const missing = await tx.query(`select * from public.owner_activity(gen_random_uuid())`);
      expect(missing.rows).toEqual([]);
      await tx.rollback();
    });
  });
});
