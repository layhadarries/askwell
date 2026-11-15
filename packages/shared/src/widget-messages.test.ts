import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  MAX_PANEL_HEIGHT,
  MAX_UNREAD_COUNT,
  MOCK_REPLY,
  parseWidgetMessage,
  widgetMessage,
  widgetMessageSchema,
} from './index';

const env = { source: 'askwell', version: 1 } as const;

describe('widget messages', () => {
  it.each([
    { ...env, type: 'ready' },
    { ...env, type: 'close' },
    { ...env, type: 'resize', height: 480 },
    { ...env, type: 'resize', height: MAX_PANEL_HEIGHT },
    { ...env, type: 'unread', count: 0 },
    { ...env, type: 'unread', count: 3 },
  ])('parses $type', (message) => {
    expect(parseWidgetMessage(message)).toEqual(message);
  });

  it.each([
    ['another script', { source: 'other-widget', version: 1, type: 'close' }],
    ['no source', { version: 1, type: 'close' }],
    ['another version', { ...env, version: 2, type: 'close' }],
    ['an unknown type', { ...env, type: 'navigate', url: 'https://evil.example' }],
    ['no type', { ...env }],
    ['an extra field', { ...env, type: 'close', html: '<img onerror=alert(1)>' }],
    ['resize without height', { ...env, type: 'resize' }],
    ['a zero height', { ...env, type: 'resize', height: 0 }],
    ['a fractional height', { ...env, type: 'resize', height: 480.5 }],
    ['a huge height', { ...env, type: 'resize', height: MAX_PANEL_HEIGHT + 1 }],
    ['a string height', { ...env, type: 'resize', height: '480' }],
    ['a negative count', { ...env, type: 'unread', count: -1 }],
    ['a huge count', { ...env, type: 'unread', count: MAX_UNREAD_COUNT + 1 }],
    ['a string', 'close'],
    ['a JSON string', JSON.stringify({ ...env, type: 'close' })],
    ['null', null],
    ['undefined', undefined],
    ['an array', [{ ...env, type: 'close' }]],
  ])('rejects %s', (_label, data) => {
    expect(parseWidgetMessage(data)).toBeNull();
    expect(widgetMessageSchema.safeParse(data).success).toBe(false);
  });

  it('builds messages that parse', () => {
    const built = [
      widgetMessage('ready'),
      widgetMessage('close'),
      widgetMessage('resize', { height: 520 }),
      widgetMessage('unread', { count: 2 }),
    ];
    expect(built).toEqual([
      { ...env, type: 'ready' },
      { ...env, type: 'close' },
      { ...env, type: 'resize', height: 520 },
      { ...env, type: 'unread', count: 2 },
    ]);
    for (const message of built) expect(parseWidgetMessage(message)).toEqual(message);
  });

  it('makes payloads required by type (checked by tsc, never run)', () => {
    const typeChecks = () => {
      // @ts-expect-error resize needs a height
      widgetMessage('resize');
      // @ts-expect-error unread needs a count
      widgetMessage('unread', {});
      // @ts-expect-error close takes no payload
      widgetMessage('close', { height: 1 });
      // @ts-expect-error unknown type
      widgetMessage('navigate');
      const build = (type: 'resize' | 'unread') =>
        // @ts-expect-error a union of payload types still needs a payload
        widgetMessage(type);
      // Narrowed unions still build.
      const either = (type: 'ready' | 'close') => widgetMessage(type);
      return [build, either];
    };
    expect(typeof typeChecks).toBe('function');
  });

  it('keeps the envelope when a payload variable carries envelope fields', () => {
    const payload = { height: 300, version: 2, source: 'other-widget', type: 'close' };
    const message = widgetMessage('resize', payload);
    expect(message).toMatchObject({ ...env, type: 'resize', height: 300 });
  });

  it('survives structured clone, as postMessage does', () => {
    const message = widgetMessage('resize', { height: 300 });
    expect(parseWidgetMessage(structuredClone(message))).toEqual(message);
  });
});

describe('MOCK_REPLY', () => {
  it('names the app from APP_NAME and says real answers come soon', () => {
    expect(MOCK_REPLY).toContain(APP_NAME);
    expect(MOCK_REPLY).toMatch(/soon/);
  });

  it('is a non-empty reply within the message length', () => {
    expect(MOCK_REPLY.trim().length).toBeGreaterThan(0);
    expect(MOCK_REPLY.length).toBeLessThanOrEqual(1000);
  });
});
