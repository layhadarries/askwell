import { z } from 'zod';
import {
  getPlanLimits,
  type Plan,
  widgetAnimationSchema,
  widgetPositionSchema,
} from './plans';

export const MAX_MESSAGE_LENGTH = 1000;
export const MAX_LABEL_LENGTH = 40;
export const MAX_HEADER_TEXT_LENGTH = 60;
export const PUBLIC_KEY_PREFIX = 'pk_';

export const publicKeySchema = z.string().startsWith(PUBLIC_KEY_PREFIX).max(128);

export const buttonColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #1a2b3c');

export const DEFAULT_WIDGET_CONFIG = {
  buttonColor: '#4f46e5',
  position: 'bottom-right',
  label: 'Chat with us',
  animation: 'fade',
  headerText: 'Ask us anything',
  showBadge: true,
} as const;

export const widgetConfigSchema = z.object({
  buttonColor: buttonColorSchema,
  position: widgetPositionSchema,
  label: z.string().trim().min(1).max(MAX_LABEL_LENGTH),
  animation: widgetAnimationSchema,
  headerText: z.string().trim().min(1).max(MAX_HEADER_TEXT_LENGTH),
  showBadge: z.boolean(),
});
export type WidgetConfig = z.infer<typeof widgetConfigSchema>;

// GET /api/widget/config
export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;
export const widgetConfigResponseSchema = widgetConfigSchema;
export type WidgetConfigResponse = WidgetConfig;

// POST /api/widget/chat
export const widgetChatRequestSchema = z.object({
  key: publicKeySchema,
  visitorId: z.string().min(1).max(128),
  conversationId: z.uuid().optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;
export const widgetChatResponseSchema = z.object({
  conversationId: z.uuid(),
  reply: z.string(),
});
export type WidgetChatResponse = z.infer<typeof widgetChatResponseSchema>;

/** Config fields in `patch` that `plan` may not change. Empty = allowed. */
export function disallowedConfigFields(
  plan: Plan,
  patch: Partial<WidgetConfig>,
): (keyof WidgetConfig)[] {
  const w = getPlanLimits(plan).widget;
  const out: (keyof WidgetConfig)[] = [];
  if (patch.buttonColor !== undefined && !w.customColor) out.push('buttonColor');
  if (patch.position !== undefined && !w.positions.includes(patch.position)) out.push('position');
  if (patch.label !== undefined && !w.customLabel) out.push('label');
  if (patch.animation !== undefined && !w.animations.includes(patch.animation)) out.push('animation');
  if (patch.headerText !== undefined && !w.customHeaderText) out.push('headerText');
  if (patch.showBadge === false && !w.canHideBadge) out.push('showBadge');
  return out;
}

/** Config a visitor sees: Free gets defaults + badge; Pro gets the saved config. */
export function applyPlanToConfig(plan: Plan, config: WidgetConfig): WidgetConfig {
  return getPlanLimits(plan).widget.canHideBadge
    ? config
    : { ...DEFAULT_WIDGET_CONFIG };
}
