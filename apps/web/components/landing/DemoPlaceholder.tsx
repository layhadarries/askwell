import { APP_NAME } from '@askwell/shared';
import { GlassPanel } from '../ui';
import { Section } from './Section';

/** Holds the spot for the live demo widget, which a later phase adds. */
export function DemoPlaceholder() {
  return (
    <Section id="demo" title="Try it" intro={`Ask ${APP_NAME} about ${APP_NAME}.`}>
      <GlassPanel
        className="landing-reveal mx-auto flex min-h-64 max-w-2xl flex-col items-center justify-center gap-3 border-dashed text-center"
        data-placeholder="demo-widget"
      >
        <p className="text-sm font-medium">Live demo coming soon</p>
        <p className="max-w-sm text-sm text-fg-muted">
          The real chat widget will run here, answering questions about {APP_NAME}.
        </p>
        <p className="mt-2 rounded-full border border-glass-border px-3 py-1 text-xs text-fg-muted">
          Powered by {APP_NAME}
        </p>
      </GlassPanel>
    </Section>
  );
}
