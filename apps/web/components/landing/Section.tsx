import type { ReactNode } from 'react';

export function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="landing-reveal mx-auto max-w-2xl text-center">
          <h2 id={`${id}-title`} className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          {intro ? <p className="mt-3 text-fg-muted">{intro}</p> : null}
        </div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}
