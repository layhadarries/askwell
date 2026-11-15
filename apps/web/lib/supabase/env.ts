/**
 * Reads a required environment variable at call time, so a missing value fails
 * with a clear message on the first request instead of at build time.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to the app's environment (see .env.example).`,
    );
  }
  return value;
}
