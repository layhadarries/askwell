import { PUBLIC_KEY_PREFIX } from '@askwell/shared';
import { GlassPanel } from '../ui';
import { Section } from './Section';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app-url';

/** A sample install tag with a placeholder key, shown as text. */
export const SAMPLE_SNIPPET = `<script src="${APP_URL}/widget.js" data-key="${PUBLIC_KEY_PREFIX}your_project_key"></script>`;

export function InstallSnippet() {
  return (
    <Section
      id="install"
      title="One line to install"
      intro="Paste this before </body>. Your dashboard gives you the tag with your real key."
    >
      <GlassPanel className="landing-reveal mx-auto max-w-3xl">
        <pre className="text-sm break-all whitespace-pre-wrap text-fg">
          <code>{SAMPLE_SNIPPET}</code>
        </pre>
      </GlassPanel>
    </Section>
  );
}
