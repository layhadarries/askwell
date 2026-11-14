import { GlassPanel } from './GlassPanel';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <GlassPanel
      className="flex items-center justify-center gap-3"
      data-state="loading"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-border border-t-accent"
      />
      <span className="text-sm text-fg-muted">{label}</span>
    </GlassPanel>
  );
}
