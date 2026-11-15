/**
 * Hand-written checks for the shared widget protocol (@askwell/shared).
 * Only types are imported, so zod stays out of the bundle. The constants are
 * typed against the shared types, and protocol.test.ts checks they match the
 * shared values and that these checks agree with parseWidgetMessage().
 */
import type {
  WidgetAnimation,
  WidgetConfig,
  WidgetMessage,
  WidgetPosition,
} from '@askwell/shared';

export const SOURCE: WidgetMessage['source'] = 'askwell';
export const VERSION: WidgetMessage['version'] = 1;
export const MAX_PANEL_HEIGHT = 2000;
export const MAX_UNREAD_COUNT = 999;
export const PUBLIC_KEY_PREFIX = 'pk_';
export const MAX_KEY_LENGTH = 128;
export const MAX_LABEL_LENGTH = 40;
export const MAX_HEADER_TEXT_LENGTH = 60;
export const POSITIONS: readonly WidgetPosition[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];
export const ANIMATIONS: readonly WidgetAnimation[] = ['fade', 'slide', 'scale'];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// hasOwnProperty.call, not the ES2022 own-key helper: the bundle targets es2020.
const hasOnlyKeys = (o: Obj, keys: readonly string[]) =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export function isPublicKey(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PUBLIC_KEY_PREFIX) && v.length <= MAX_KEY_LENGTH;
}

/** Same rules as parseWidgetMessage: strict shape, envelope, bounds. */
export function parseMessage(data: unknown): WidgetMessage | null {
  if (!isObj(data) || data.source !== SOURCE || data.version !== VERSION) return null;
  switch (data.type) {
    case 'ready':
    case 'close':
      return hasOnlyKeys(data, ['source', 'version', 'type']) ? (data as WidgetMessage) : null;
    case 'resize':
      return hasOnlyKeys(data, ['source', 'version', 'type', 'height']) &&
        isInt(data.height) &&
        data.height > 0 &&
        data.height <= MAX_PANEL_HEIGHT
        ? (data as WidgetMessage)
        : null;
    case 'unread':
      return hasOnlyKeys(data, ['source', 'version', 'type', 'count']) &&
        isInt(data.count) &&
        data.count >= 0 &&
        data.count <= MAX_UNREAD_COUNT
        ? (data as WidgetMessage)
        : null;
    default:
      return null;
  }
}

export function message<T extends 'ready'>(type: T): WidgetMessage {
  return { source: SOURCE, version: VERSION, type };
}

const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;

/** The config from GET /api/widget/config, or null if it isn't one. */
export function parseConfig(data: unknown): WidgetConfig | null {
  if (!isObj(data)) return null;
  const { buttonColor, position, label, animation, headerText, showBadge } = data;
  if (typeof buttonColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(buttonColor)) return null;
  if (!POSITIONS.includes(position as WidgetPosition)) return null;
  if (!ANIMATIONS.includes(animation as WidgetAnimation)) return null;
  if (!text(label, MAX_LABEL_LENGTH) || !text(headerText, MAX_HEADER_TEXT_LENGTH)) return null;
  if (typeof showBadge !== 'boolean') return null;
  return {
    buttonColor,
    position: position as WidgetPosition,
    label: label.trim(),
    animation: animation as WidgetAnimation,
    headerText: headerText.trim(),
    showBadge,
  };
}
