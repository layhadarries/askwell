import Link from 'next/link';
import type { Plan } from '@askwell/shared';
import { GlassPanel } from '../ui';
import { SIGN_UP_PATH, ctaClass, ghostClass } from './links';
import { planRows } from './plans';
import { Section } from './Section';

const CARDS: { plan: Plan; name: string; tagline: string; cta: string; primary: boolean }[] = [
  {
    plan: 'free',
    name: 'Free',
    tagline: 'Free to start. No card needed.',
    cta: 'Start free',
    primary: true,
  },
  {
    plan: 'pro',
    name: 'Pro',
    tagline: 'More room, and the widget your way. Upgrade from your dashboard.',
    cta: 'Start free, upgrade later',
    primary: false,
  },
];

export function Pricing() {
  return (
    <Section id="pricing" title="Pricing" intro="Start on Free. Upgrade to Pro when you need more.">
      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <GlassPanel key={card.plan} className="landing-reveal flex flex-col" data-plan={card.plan}>
            <h3 className="text-xl font-semibold">{card.name}</h3>
            <p className="mt-1 text-sm text-fg-muted">{card.tagline}</p>
            <dl className="mt-6 flex-1 divide-y divide-border text-sm">
              {planRows(card.plan).map((row) => (
                <div key={row.label} className="flex justify-between gap-4 py-2">
                  <dt className="text-fg-muted">{row.label}</dt>
                  <dd className="text-right font-medium" data-row={row.label}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              href={SIGN_UP_PATH}
              className={`mt-6 ${card.primary ? ctaClass : ghostClass}`}
            >
              {card.cta}
            </Link>
          </GlassPanel>
        ))}
      </div>
    </Section>
  );
}
