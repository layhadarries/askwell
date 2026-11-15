import Link from 'next/link';
import type { CSSProperties } from 'react';
import { APP_NAME } from '@askwell/shared';
import { SIGN_UP_PATH, ctaClass, ghostClass } from './links';

const delay = (ms: number) => ({ '--delay': `${ms}ms` }) as CSSProperties;

export function Hero() {
  return (
    <section className="relative px-4 pt-24 pb-20 text-center sm:pt-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-3xl rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.10),transparent)] blur-md"
      />
      <p
        className="landing-enter mx-auto inline-flex rounded-full border border-glass-border bg-glass px-3 py-1 text-xs text-fg-muted backdrop-blur-sm"
        style={delay(0)}
      >
        {APP_NAME} · AI support chat
      </p>
      <h1
        className="landing-enter mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
        style={delay(100)}
      >
        Answers for your visitors, from your own docs
      </h1>
      <p
        className="landing-enter mx-auto mt-5 max-w-xl text-base text-pretty text-fg-muted sm:text-lg"
        style={delay(200)}
      >
        Add what you know, paste one script tag, and a chat bot answers questions on your site. Day
        and night.
      </p>
      <div
        className="landing-enter mt-8 flex flex-wrap items-center justify-center gap-3"
        style={delay(300)}
      >
        <Link href={SIGN_UP_PATH} className={ctaClass}>
          Start free
        </Link>
        <a href="#how-it-works" className={ghostClass}>
          How it works
        </a>
      </div>
    </section>
  );
}
