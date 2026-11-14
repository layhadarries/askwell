import { z } from 'zod';

export const ERROR_CODES = [
  'invalid_input',
  'unauthorized',
  'forbidden',
  'not_found',
  'plan_required',
  'limit_reached',
  'quota_exceeded',
  'rate_limited',
  'message_blocked',
  'file_too_large',
  'unsupported_file_type',
  'conflict',
  'internal_error',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Default HTTP status for each error code. */
export const ERROR_STATUS = {
  invalid_input: 400,
  unauthorized: 401,
  plan_required: 402,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  file_too_large: 413,
  unsupported_file_type: 415,
  message_blocked: 422,
  limit_reached: 403,
  quota_exceeded: 429,
  rate_limited: 429,
  internal_error: 500,
} as const satisfies Record<ErrorCode, number>;

export function apiError(code: ErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
