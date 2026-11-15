import type { Database, Tables } from '@askwell/db';
import { auth } from '@clerk/nextjs/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

export type OwnerClient = SupabaseClient<Database>;

/**
 * The signed-in owner's client. Requests carry the owner's Clerk session token
 * (Supabase third-party auth), so RLS scopes every read to their own rows.
 * Signed out, there is no token and the request runs as `anon`, which sees nothing.
 */
export function createOwnerClient(): OwnerClient {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      accessToken: async () => {
        const { getToken } = await auth();
        return getToken();
      },
    },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project if the signed-in owner owns it, else null. RLS does the owner
 * check. Call this before any service-client write for a project (§9).
 */
export async function getOwnedProject(
  projectId: string,
  client: OwnerClient = createOwnerClient(),
): Promise<Tables<'projects'> | null> {
  if (!UUID.test(projectId)) return null;
  const { data, error } = await client
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(`getOwnedProject failed: ${error.message}`, { cause: error });
  return data;
}
