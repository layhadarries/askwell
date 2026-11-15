import 'server-only';
import type { Database } from '@askwell/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

export type ServiceClient = SupabaseClient<Database>;

/**
 * The server's client, with the secret key: it bypasses RLS. Use it only on the
 * server, and only after the route has checked ownership (getOwnedProject) and
 * the plan. This is the only file that reads SUPABASE_SECRET_KEY.
 */
export function createServiceClient(): ServiceClient {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
