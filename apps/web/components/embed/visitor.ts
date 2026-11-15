export const VISITOR_ID_KEY = 'askwell.visitorId';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Used when storage is blocked (private mode, third-party storage off). */
let memoryId: string | null = null;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * A random visitor ID, kept in the iframe's localStorage and reused across
 * visits. If storage throws, it falls back to one ID held in memory.
 */
export function getVisitorId(
  storage: Storage | null = defaultStorage(),
  newId: () => string = () => crypto.randomUUID(),
): string {
  try {
    const stored = storage?.getItem(VISITOR_ID_KEY);
    if (stored && UUID.test(stored)) return stored;
    const id = newId();
    if (!storage) throw new Error('no storage');
    storage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}

/** Test helper. */
export function resetMemoryVisitorId(): void {
  memoryId = null;
}
