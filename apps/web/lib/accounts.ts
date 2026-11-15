import 'server-only';
import { createServiceClient } from './supabase/service';

/**
 * Makes sure the signed-in Clerk user has an `accounts` row (plan `free`).
 *
 * Insert-only: `ON CONFLICT DO NOTHING`, so a second call changes nothing and
 * an existing plan (e.g. `pro`, set by the Clerk webhook) is never reset.
 *
 * Pass only an ID from Clerk's server-side `auth()`, never one from the client.
 * Owners can't insert their own row under RLS, so this uses the service client.
 */
export async function ensureAccount(clerkUserId: string | null | undefined): Promise<void> {
  if (!clerkUserId) return;
  const { error } = await createServiceClient()
    .from('accounts')
    .upsert(
      { clerk_user_id: clerkUserId, plan: 'free' },
      { onConflict: 'clerk_user_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(`ensureAccount failed: ${error.message}`, { cause: error });
}
