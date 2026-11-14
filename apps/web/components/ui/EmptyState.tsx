import type { ReactNode } from 'react';
import { GlassPanel } from './GlassPanel';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <GlassPanel className="flex flex-col items-center gap-3 text-center" data-state="empty">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
      {action}
    </GlassPanel>
  );
}
