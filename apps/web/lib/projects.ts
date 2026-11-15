import 'server-only';
import { randomBytes } from 'node:crypto';
import type { Tables } from '@askwell/db';
import {
  apiError,
  ERROR_STATUS,
  type ErrorCode,
  PLAN_LIMITS,
  type Plan,
  type Project,
  PUBLIC_KEY_PREFIX,
} from '@askwell/shared';
import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { OwnerClient } from './supabase/owner';

/** Random bytes in a public key: 24 bytes = 192 bits, 32 base64url characters. */
export const PUBLIC_KEY_BYTES = 24;

/** `pk_` plus 24 random bytes from the OS CSPRNG, base64url (URL- and HTML-safe). */
export function generatePublicKey(): string {
  return `${PUBLIC_KEY_PREFIX}${randomBytes(PUBLIC_KEY_BYTES).toString('base64url')}`;
}

/** Maps a `projects` row to the API shape. The message limit comes from the plan. */
export function toProject(row: Tables<'projects'>, plan: Plan): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    messageLimit: PLAN_LIMITS[plan].messagesPerMonth,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

/** `{ error: { code, message } }` with the code's status (shared ERROR_STATUS). */
export function errorResponse(code: ErrorCode, message: string): NextResponse {
  return NextResponse.json(apiError(code, message), { status: ERROR_STATUS[code] });
}

/**
 * 500 `internal_error` for a failed database call. Logs the cause on the server
 * only; the client gets a generic message, never the database's.
 */
export function internalError(route: string, message: string, cause: unknown): NextResponse {
  console.error(`${route} failed`, cause);
  return errorResponse('internal_error', message);
}

/**
 * Signed-in owner's Clerk user ID, from the server session only.
 *
 * Calls `auth.protect()` first, as every owner handler must. In a route handler
 * Clerk answers a signed-out call with a bare 404, so the session is checked
 * with `auth()` before that, to return our 401 error shape. The proxy also
 * returns 401 for these paths; this check doesn't rely on it.
 */
export async function requireOwnerId(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) return errorResponse('unauthorized', 'Sign in required');
  await auth.protect();
  return userId;
}

/**
 * The owner's plan, read on the server through the owner client (RLS: own row
 * only). Never from the request. A missing row reads as `free`, the stricter plan.
 */
export async function getOwnerPlan(client: OwnerClient): Promise<Plan> {
  const { data, error } = await client.from('accounts').select('plan').maybeSingle();
  if (error) throw new Error(`getOwnerPlan failed: ${error.message}`, { cause: error });
  return data?.plan === 'pro' ? 'pro' : 'free';
}

/** The part of a zod schema this file uses, so apps/web needn't depend on zod. */
interface SafeParser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/** Parses a JSON body against a shared schema; null for bad JSON or bad input. */
export async function parseJsonBody<T>(
  request: Request,
  schema: SafeParser<T>,
): Promise<T | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

/** True when a Postgres function raised `P0001` with this message (e.g. `limit_reached`). */
export function isRaised(error: { code?: string; message?: string } | null, message: string) {
  return error?.code === 'P0001' && error.message === message;
}
