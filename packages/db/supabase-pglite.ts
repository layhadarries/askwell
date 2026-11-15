/**
 * In-memory Postgres (pglite) with just enough of Supabase stubbed to test our
 * migrations, RLS policies and grants. Never a local Supabase stack or Docker.
 *
 * Stubbed: the API roles (anon, authenticated, service_role), `auth.jwt()`,
 * the `extensions` schema (pgvector lives there), `storage.buckets`, and
 * Supabase's default grants to the API roles on `public`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

export const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../supabase/migrations', import.meta.url),
);

export type ApiRole = 'anon' | 'authenticated' | 'service_role';

const SUPABASE_STUB = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  -- Same shape as Supabase's auth.jwt(): the claims PostgREST sets per request.
  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  grant execute on function auth.jwt() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    owner uuid,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  alter table storage.buckets enable row level security;

  -- Supabase's defaults: the API roles get everything on new objects in public.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role postgres in schema public
    grant all on functions to anon, authenticated, service_role;
`;

/** Migration files in `supabase/migrations`, oldest first. */
export async function listMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = await readdir(dir);
  return files.filter((f) => f.endsWith('.sql')).sort();
}

/** A fresh database with the Supabase stub and every migration applied. */
export async function createSupabasePglite(
  options: { migrations?: boolean } = {},
): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);
  if (options.migrations ?? true) {
    for (const file of await listMigrations()) {
      await db.exec(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  }
  return db;
}

/**
 * Runs `fn` as an API role, the way PostgREST does: `set local role` plus the
 * request's JWT claims. Rolled back afterwards, so tests never leak state.
 */
export async function asRole<T>(
  db: PGlite,
  role: ApiRole,
  claims: Record<string, unknown> | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let error: unknown;
  let failed = false;
  try {
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        claims ? JSON.stringify(claims) : '',
      ]);
      await tx.exec(`set local role ${role}`);
      try {
        result = await fn(tx);
      } catch (e) {
        error = e;
        failed = true;
      }
      await tx.rollback();
    });
  } catch (e) {
    if (!failed) throw e;
  }
  if (failed) throw error;
  return result as T;
}

/** Runs `fn` as the signed-in owner with this Clerk user ID. */
export function asOwner<T>(
  db: PGlite,
  clerkUserId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return asRole(db, 'authenticated', { sub: clerkUserId, role: 'authenticated' }, fn);
}
