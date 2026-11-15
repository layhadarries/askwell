import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asOwner,
  asRole,
  createSupabasePglite,
  listMigrations,
} from '../supabase-pglite';

const TABLES = [
  'accounts',
  'projects',
  'widget_configs',
  'knowledge_sources',
  'knowledge_chunks',
  'conversations',
  'messages',
] as const;

const OWNER_A = 'user_a';
const OWNER_B = 'user_b';

const IDS = {
  [OWNER_A]: {
    project: '00000000-0000-4000-8000-00000000000a',
    source: '00000000-0000-4000-8000-0000000000a1',
    chunk: '00000000-0000-4000-8000-0000000000a2',
    conversation: '00000000-0000-4000-8000-0000000000a3',
    message: '00000000-0000-4000-8000-0000000000a4',
  },
  [OWNER_B]: {
    project: '00000000-0000-4000-8000-00000000000b',
    source: '00000000-0000-4000-8000-0000000000b1',
    chunk: '00000000-0000-4000-8000-0000000000b2',
    conversation: '00000000-0000-4000-8000-0000000000b3',
    message: '00000000-0000-4000-8000-0000000000b4',
  },
};

const EMBEDDING = `[${Array.from({ length: 1536 }, () => '0.01').join(',')}]`;
const PERMISSION_DENIED = /permission denied/;

let db: PGlite;

/** Seeds one owner with a row in every table, as the database owner. */
async function seedOwner(owner: typeof OWNER_A | typeof OWNER_B) {
  const ids = IDS[owner];
  await db.query(`insert into public.accounts (clerk_user_id) values ($1)`, [owner]);
  await db.query(
    `insert into public.projects (id, owner_id, name, public_key) values ($1, $2, $3, $4)`,
    [ids.project, owner, `Project ${owner}`, `pk_${owner}`],
  );
  await db.query(`insert into public.widget_configs (project_id) values ($1)`, [ids.project]);
  await db.query(
    `insert into public.knowledge_sources (id, project_id, title, type, status)
     values ($1, $2, 'FAQ', 'text', 'ready')`,
    [ids.source, ids.project],
  );
  await db.query(
    `insert into public.knowledge_chunks (id, project_id, source_id, content, embedding)
     values ($1, $2, $3, 'Hello', $4)`,
    [ids.chunk, ids.project, ids.source, EMBEDDING],
  );
  await db.query(
    `insert into public.conversations (id, project_id, visitor_id) values ($1, $2, 'v1')`,
    [ids.conversation, ids.project],
  );
  await db.query(
    `insert into public.messages (id, conversation_id, role, body) values ($1, $2, 'visitor', 'Hi')`,
    [ids.message, ids.conversation],
  );
}

beforeAll(async () => {
  db = await createSupabasePglite();
  await seedOwner(OWNER_A);
  await seedOwner(OWNER_B);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migration files', () => {
  it('are named <UTC timestamp>_<name>.sql', async () => {
    const files = await listMigrations();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
  });
});

describe('schema', () => {
  it('has exactly the 7 tables, each with RLS on', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...TABLES].sort());
    for (const row of rows) expect(row, row.relname).toMatchObject({ relrowsecurity: true });
  });

  it('has an HNSW index on knowledge_chunks.embedding', async () => {
    const { rows } = await db.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
       where schemaname = 'public' and tablename = 'knowledge_chunks' and indexdef ilike '%hnsw%'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toMatch(/\(embedding extensions\.vector_cosine_ops\)/);
  });

  it('only the two RLS helpers are SECURITY DEFINER, with search_path = ""', async () => {
    const { rows } = await db.query<{ name: string; config: string[] | null }>(
      `select n.nspname || '.' || p.proname as name, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
       order by 1`,
    );
    expect(rows.map((r) => r.name)).toEqual([
      'private.owned_conversation_ids',
      'private.owned_project_ids',
    ]);
    for (const row of rows) expect(row.config).toContain('search_path=""');
  });

  it('keeps a chunk in the same project as its source', async () => {
    await expect(
      db.query(
        `insert into public.knowledge_chunks (project_id, source_id, content, embedding)
         values ($1, $2, 'x', $3)`,
        [IDS[OWNER_B].project, IDS[OWNER_A].source, EMBEDDING],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it('requires a storage_key for files and none for pasted text', async () => {
    await expect(
      db.query(
        `insert into public.knowledge_sources (project_id, title, type) values ($1, 'f', 'pdf')`,
        [IDS[OWNER_A].project],
      ),
    ).rejects.toThrow(/storage_key_matches_type/);
  });

  it('deletes chunks with their source, and everything with its project', async () => {
    await db.transaction(async (tx) => {
      await tx.query(`delete from public.knowledge_sources where id = $1`, [IDS[OWNER_A].source]);
      const chunks = await tx.query(`select 1 from public.knowledge_chunks where source_id = $1`, [
        IDS[OWNER_A].source,
      ]);
      expect(chunks.rows).toHaveLength(0);

      await tx.query(`delete from public.projects where id = $1`, [IDS[OWNER_B].project]);
      for (const table of TABLES.filter((t) => t !== 'accounts' && t !== 'projects')) {
        const { rows } = await tx.query<{ n: number }>(
          `select count(*)::int as n from public.${table}`,
        );
        // A lost its source (and so its chunk); B lost its whole project.
        const expected = table === 'knowledge_sources' || table === 'knowledge_chunks' ? 0 : 1;
        expect(rows[0]?.n, table).toBe(expected);
      }
      await tx.rollback();
    });
  });
});

describe('authenticated owner', () => {
  it.each(TABLES)('reads only their own rows in %s', async (table) => {
    for (const owner of [OWNER_A, OWNER_B]) {
      const { rows } = await asOwner(db, owner, (tx) =>
        tx.query<{ owner: string }>(
          table === 'accounts'
            ? `select clerk_user_id as owner from public.accounts`
            : table === 'messages'
              ? `select p.owner_id as owner from public.messages m
                 join public.conversations c on c.id = m.conversation_id
                 join public.projects p on p.id = c.project_id`
              : table === 'projects'
                ? `select owner_id as owner from public.projects`
                : `select p.owner_id as owner from public.${table} t
                   join public.projects p on p.id = t.project_id`,
        ),
      );
      expect(rows, `${owner} on ${table}`).toEqual([{ owner }]);
    }
  });

  it('reads nothing without a sub claim', async () => {
    for (const table of TABLES) {
      const { rows } = await asRole(db, 'authenticated', { role: 'authenticated' }, (tx) =>
        tx.query(`select * from public.${table}`),
      );
      expect(rows, table).toHaveLength(0);
    }
  });

  it('renames their own project', async () => {
    const { rows } = await asOwner(db, OWNER_A, (tx) =>
      tx.query<{ name: string }>(
        `update public.projects set name = 'Renamed' where id = $1 returning name`,
        [IDS[OWNER_A].project],
      ),
    );
    expect(rows).toEqual([{ name: 'Renamed' }]);
  });

  it("cannot rename or delete another owner's project", async () => {
    await asOwner(db, OWNER_A, async (tx) => {
      const renamed = await tx.query(`update public.projects set name = 'x' where id = $1`, [
        IDS[OWNER_B].project,
      ]);
      expect(renamed.affectedRows).toBe(0);
      const deleted = await tx.query(`delete from public.projects where id = $1`, [
        IDS[OWNER_B].project,
      ]);
      expect(deleted.affectedRows).toBe(0);
    });
    const { rows } = await db.query<{ name: string }>(
      `select name from public.projects where id = $1`,
      [IDS[OWNER_B].project],
    );
    expect(rows).toEqual([{ name: `Project ${OWNER_B}` }]);
  });

  it('deletes their own project', async () => {
    const result = await asOwner(db, OWNER_A, (tx) =>
      tx.query(`delete from public.projects where id = $1`, [IDS[OWNER_A].project]),
    );
    expect(result.affectedRows).toBe(1);
  });

  it.each(['owner_id', 'public_key', 'messages_used', 'period_start', 'created_at', 'id'])(
    'cannot change projects.%s',
    async (column) => {
      const value =
        column === 'owner_id'
          ? `'${OWNER_B}'`
          : column === 'public_key'
            ? `'pk_new'`
            : column === 'messages_used'
              ? '0'
              : column === 'id'
                ? 'gen_random_uuid()'
                : 'now()';
      await expect(
        asOwner(db, OWNER_A, (tx) =>
          tx.query(`update public.projects set ${column} = ${value} where id = $1`, [
            IDS[OWNER_A].project,
          ]),
        ),
      ).rejects.toThrow(PERMISSION_DENIED);
    },
  );

  it.each(TABLES)('cannot insert into %s', async (table) => {
    await expect(
      asOwner(db, OWNER_A, (tx) => tx.query(`insert into public.${table} default values`)),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(TABLES.filter((t) => t !== 'projects'))('cannot update or delete %s', async (table) => {
    await expect(
      asOwner(db, OWNER_A, (tx) => tx.query(`delete from public.${table}`)),
    ).rejects.toThrow(PERMISSION_DENIED);
    const column = table === 'accounts' ? 'plan' : table === 'widget_configs' ? 'label' : 'id';
    await expect(
      asOwner(db, OWNER_A, (tx) => tx.query(`update public.${table} set ${column} = ${column}`)),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it('cannot upgrade their own plan', async () => {
    await expect(
      asOwner(db, OWNER_A, (tx) => tx.query(`update public.accounts set plan = 'pro'`)),
    ).rejects.toThrow(PERMISSION_DENIED);
  });
});

describe('anon', () => {
  it.each(TABLES)('cannot read %s', async (table) => {
    await expect(
      asRole(db, 'anon', { role: 'anon' }, (tx) => tx.query(`select * from public.${table}`)),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it.each(TABLES)('cannot write %s', async (table) => {
    await expect(
      asRole(db, 'anon', null, (tx) => tx.query(`insert into public.${table} default values`)),
    ).rejects.toThrow(PERMISSION_DENIED);
  });

  it('cannot call the RLS helpers', async () => {
    for (const fn of ['owned_project_ids', 'owned_conversation_ids']) {
      await expect(
        asRole(db, 'anon', null, (tx) => tx.query(`select private.${fn}()`)),
      ).rejects.toThrow(PERMISSION_DENIED);
    }
  });
});

describe('service_role', () => {
  it('reads every row and can write', async () => {
    await asRole(db, 'service_role', { role: 'service_role' }, async (tx) => {
      for (const table of TABLES) {
        const { rows } = await tx.query(`select * from public.${table}`);
        expect(rows, table).toHaveLength(2);
      }
      await tx.query(`insert into public.accounts (clerk_user_id) values ('user_c')`);
      await tx.query(`update public.accounts set plan = 'pro' where clerk_user_id = 'user_c'`);
    });
  });
});

describe('TRUNCATE', () => {
  it.each(['anon', 'authenticated', 'service_role'] as const)('is denied to %s', async (role) => {
    for (const table of TABLES) {
      await expect(
        asRole(db, role, null, (tx) => tx.query(`truncate public.${table} cascade`)),
        `${role} on ${table}`,
      ).rejects.toThrow(PERMISSION_DENIED);
    }
  });
});

describe('default privileges', () => {
  it('give API roles nothing on new tables or functions in public', async () => {
    await db.transaction(async (tx) => {
      await tx.exec(`create table public.later_table (id int)`);
      await tx.exec(`create function public.later_fn() returns int language sql as 'select 1'`);
      const { rows } = await tx.query<{ role: string; t: boolean; f: boolean }>(
        `select r as role,
                has_table_privilege(r, 'public.later_table', 'select') as t,
                has_function_privilege(r, 'public.later_fn()', 'execute') as f
         from unnest(array['anon', 'authenticated', 'service_role']) r`,
      );
      for (const row of rows) expect(row, row.role).toMatchObject({ t: false, f: false });
      await tx.rollback();
    });
  });
});

describe('knowledge bucket', () => {
  it('is private, 10 MB, PDF/Markdown/TXT only', async () => {
    const { rows } = await db.query(
      `select public, file_size_limit::int as limit, allowed_mime_types
       from storage.buckets where id = 'knowledge'`,
    );
    expect(rows).toEqual([
      {
        public: false,
        limit: 10 * 1024 * 1024,
        allowed_mime_types: ['application/pdf', 'text/markdown', 'text/x-markdown', 'text/plain'],
      },
    ]);
  });
});
