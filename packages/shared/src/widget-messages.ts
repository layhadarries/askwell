import { z } from 'zod';

/**
 * postMessage protocol between the loader (apps/widget, on the customer's page)
 * and the panel (/embed, inside the iframe). Every message the panel sends to
 * the loader is one of these.
 *
 * Both sides must also check `event.origin` before parsing (§9), and never post
 * data with `*` as the target origin. The schema rejects anything else that
 * reaches the window: other scripts' messages, unknown types, other versions,
 * extra fields.
 */
export const WIDGET_MESSAGE_SOURCE = 'askwell';
export const WIDGET_MESSAGE_VERSION = 1;

/** Upper bounds, so a bad value can't push the iframe to an absurd size. */
export const MAX_PANEL_HEIGHT = 2000;
export const MAX_UNREAD_COUNT = 999;

const envelope = {
  source: z.literal(WIDGET_MESSAGE_SOURCE),
  version: z.literal(WIDGET_MESSAGE_VERSION),
};

/** Panel → loader: the panel has loaded and is listening. */
export const widgetReadyMessageSchema = z.strictObject({ ...envelope, type: z.literal('ready') });
/** Panel → loader: the visitor closed the panel. */
export const widgetCloseMessageSchema = z.strictObject({ ...envelope, type: z.literal('close') });
/** Panel → loader: set the iframe height in CSS pixels. */
export const widgetResizeMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal('resize'),
  height: z.number().int().positive().max(MAX_PANEL_HEIGHT),
});
/** Panel → loader: number of unread bot replies, for the button badge. 0 clears it. */
export const widgetUnreadMessageSchema = z.strictObject({
  ...envelope,
  type: z.literal('unread'),
  count: z.number().int().nonnegative().max(MAX_UNREAD_COUNT),
});

export const widgetMessageSchema = z.discriminatedUnion('type', [
  widgetReadyMessageSchema,
  widgetCloseMessageSchema,
  widgetResizeMessageSchema,
  widgetUnreadMessageSchema,
]);
export type WidgetMessage = z.infer<typeof widgetMessageSchema>;
export type WidgetMessageType = WidgetMessage['type'];

/** The message, or null for anything that isn't a valid widget message. */
export function parseWidgetMessage(data: unknown): WidgetMessage | null {
  const result = widgetMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

type Payload<T extends WidgetMessageType> = Omit<
  Extract<WidgetMessage, { type: T }>,
  'source' | 'version' | 'type'
>;

/** Builds a message with the envelope filled in, e.g. widgetMessage('resize', { height: 480 }). */
export function widgetMessage<T extends WidgetMessageType>(
  type: T,
  ...payload: keyof Payload<T> extends never ? [] : [Payload<T>]
): Extract<WidgetMessage, { type: T }> {
  return {
    source: WIDGET_MESSAGE_SOURCE,
    version: WIDGET_MESSAGE_VERSION,
    type,
    ...(payload[0] ?? {}),
  } as Extract<WidgetMessage, { type: T }>;
}
