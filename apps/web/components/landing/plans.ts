import { PLAN_LIMITS, type Plan } from '@askwell/shared';

export interface PlanRow {
  label: string;
  value: string;
}

const number = new Intl.NumberFormat('en-US');

/** Pricing card rows for a plan, read from PLAN_LIMITS (project.md §5). */
export function planRows(plan: Plan): PlanRow[] {
  const limits = PLAN_LIMITS[plan];
  const w = limits.widget;
  return [
    { label: 'Projects', value: number.format(limits.projects) },
    { label: 'Messages / month per project', value: number.format(limits.messagesPerMonth) },
    { label: 'Knowledge sources per project', value: number.format(limits.knowledgeSources) },
    { label: 'Button color', value: w.customColor ? 'Any' : 'Default' },
    {
      label: 'Button position',
      value: w.positions.length > 1 ? 'Any corner' : 'Bottom right',
    },
    { label: 'Button label', value: w.customLabel ? 'Custom' : 'Default' },
    {
      label: 'Open animation',
      value: w.animations.map((a) => a[0]?.toUpperCase() + a.slice(1)).join(' / '),
    },
    { label: 'Header text', value: w.customHeaderText ? 'Custom' : 'Default' },
    { label: '“Powered by” badge', value: w.canHideBadge ? 'Hidden' : 'Shown' },
  ];
}
