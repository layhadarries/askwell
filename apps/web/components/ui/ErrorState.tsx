import type { ReactNode } from 'react';
import { GlassPanel } from './GlassPanel';

export function ErrorState({
  title = 'Something went wrong',
  message,
  action,
}: {
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <GlassPanel
      className="flex flex-col items-center gap-3 text-center"
      data-state="error"
      role="alert"
    >
      <h2 className="text-lg font-semibold text-danger">{title}</h2>
      {message ? <p className="text-sm text-fg-muted">{message}</p> : null}
      {action}
    </GlassPanel>
  );
}
