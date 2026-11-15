import { GlassPanel } from '../ui';
import { Section } from './Section';

const STEPS = [
  {
    title: 'Add your info',
    body: 'Paste text or upload a PDF: product details, FAQs, policies. That’s what the bot knows.',
  },
  {
    title: 'Copy one script tag',
    body: 'Paste it into your site’s HTML. A chat button appears in the corner.',
  },
  {
    title: 'Visitors get answers',
    body: 'People ask questions and get replies from your info, right on your page.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works" intro="Three steps. No code beyond one line.">
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="landing-reveal">
            <GlassPanel className="h-full">
              <span className="flex size-8 items-center justify-center rounded-full border border-glass-border text-sm font-semibold">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-fg-muted">{step.body}</p>
            </GlassPanel>
          </li>
        ))}
      </ol>
    </Section>
  );
}
