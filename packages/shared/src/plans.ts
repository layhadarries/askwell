import { z } from 'zod';

export const PLANS = ['free', 'pro'] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

export const WIDGET_POSITIONS = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const;
export const widgetPositionSchema = z.enum(WIDGET_POSITIONS);
export type WidgetPosition = z.infer<typeof widgetPositionSchema>;

export const WIDGET_ANIMATIONS = ['fade', 'slide', 'scale'] as const;
export const widgetAnimationSchema = z.enum(WIDGET_ANIMATIONS);
export type WidgetAnimation = z.infer<typeof widgetAnimationSchema>;

export interface PlanLimits {
  /** Projects per account. */
  projects: number;
  /** Accepted chat messages per project per month. */
  messagesPerMonth: number;
  /** Knowledge sources (files + pasted text) per project. */
  knowledgeSources: number;
  /** Widget customization the plan may use. */
  widget: {
    customColor: boolean;
    positions: readonly WidgetPosition[];
    customLabel: boolean;
    animations: readonly WidgetAnimation[];
    customHeaderText: boolean;
    /** Whether the "Powered by" badge may be hidden. */
    canHideBadge: boolean;
  };
}

/** Single source of truth for plan limits (project.md §5). */
export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    widget: {
      customColor: false,
      positions: ['bottom-right'],
      customLabel: false,
      animations: ['fade'],
      customHeaderText: false,
      canHideBadge: false,
    },
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    widget: {
      customColor: true,
      positions: WIDGET_POSITIONS,
      customLabel: true,
      animations: WIDGET_ANIMATIONS,
      customHeaderText: true,
      canHideBadge: true,
    },
  },
} as const satisfies Record<Plan, PlanLimits>;

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
