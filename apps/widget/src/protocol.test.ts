import * as shared from '@askwell/shared';
import { describe, expect, it } from 'vitest';
import * as local from './protocol';

describe('local protocol copies match @askwell/shared', () => {
  it('constants', () => {
    expect(local.SOURCE).toBe(shared.WIDGET_MESSAGE_SOURCE);
    expect(local.VERSION).toBe(shared.WIDGET_MESSAGE_VERSION);
    expect(local.MAX_PANEL_HEIGHT).toBe(shared.MAX_PANEL_HEIGHT);
    expect(local.MAX_UNREAD_COUNT).toBe(shared.MAX_UNREAD_COUNT);
    expect(local.PUBLIC_KEY_PREFIX).toBe(shared.PUBLIC_KEY_PREFIX);
    expect(local.MAX_LABEL_LENGTH).toBe(shared.MAX_LABEL_LENGTH);
    expect(local.MAX_HEADER_TEXT_LENGTH).toBe(shared.MAX_HEADER_TEXT_LENGTH);
    expect(local.POSITIONS).toEqual(shared.WIDGET_POSITIONS);
    expect(local.ANIMATIONS).toEqual(shared.WIDGET_ANIMATIONS);
  });

  const env = { source: 'askwell', version: 1 };
  const samples: unknown[] = [
    { ...env, type: 'ready' },
    { ...env, type: 'close' },
    { ...env, type: 'resize', height: 1 },
    { ...env, type: 'resize', height: 2000 },
    { ...env, type: 'resize', height: 2001 },
    { ...env, type: 'resize', height: 0 },
    { ...env, type: 'resize', height: 1.5 },
    { ...env, type: 'resize' },
    { ...env, type: 'unread', count: 0 },
    { ...env, type: 'unread', count: 999 },
    { ...env, type: 'unread', count: 1000 },
    { ...env, type: 'unread', count: -1 },
    { ...env, type: 'close', extra: true },
    { ...env, type: 'nope' },
    { source: 'other', version: 1, type: 'ready' },
    { source: 'askwell', version: 2, type: 'ready' },
    { type: 'ready' },
    [],
    null,
    'ready',
    42,
  ];
  it.each(samples.map((s) => [JSON.stringify(s), s]))('parseMessage agrees with parseWidgetMessage: %s', (_l, s) => {
    expect(local.parseMessage(s)).toEqual(shared.parseWidgetMessage(s));
  });

  it.each(['pk_a', 'pk_' + 'x'.repeat(125), 'pk_' + 'x'.repeat(126), 'sk_a', '', 'pk', 42])(
    'isPublicKey agrees with publicKeySchema: %s',
    (k) => {
      expect(local.isPublicKey(k)).toBe(shared.publicKeySchema.safeParse(k).success);
    },
  );

  it.each([
    shared.DEFAULT_WIDGET_CONFIG,
    { ...shared.DEFAULT_WIDGET_CONFIG, position: 'middle' },
    { ...shared.DEFAULT_WIDGET_CONFIG, animation: 'spin' },
    { ...shared.DEFAULT_WIDGET_CONFIG, buttonColor: '#fff' },
    { ...shared.DEFAULT_WIDGET_CONFIG, label: '' },
    { ...shared.DEFAULT_WIDGET_CONFIG, label: 'x'.repeat(41) },
    { ...shared.DEFAULT_WIDGET_CONFIG, headerText: '   ' },
    { ...shared.DEFAULT_WIDGET_CONFIG, showBadge: 'yes' },
    {},
    null,
  ])('parseConfig agrees with widgetConfigSchema: %j', (c) => {
    const ok = shared.widgetConfigSchema.safeParse(c);
    expect(local.parseConfig(c)).toEqual(ok.success ? ok.data : null);
  });

  it('message() builds the shared shape', () => {
    expect(shared.parseWidgetMessage(local.message('ready'))).toEqual(shared.widgetMessage('ready'));
  });
});
