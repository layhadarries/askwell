import Link from 'next/link';
import { APP_NAME } from '@askwell/shared';
import { SIGN_UP_PATH } from './links';

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-sm text-fg-muted sm:flex-row">
        <p>
          © {new Date().getFullYear()} {APP_NAME}
        </p>
        <nav aria-label="Footer" className="flex gap-6">
          <a href="#pricing" className="hover:text-fg">
            Pricing
          </a>
          <Link href="/sign-in" className="hover:text-fg">
            Sign in
          </Link>
          <Link href={SIGN_UP_PATH} className="hover:text-fg">
            Start free
          </Link>
        </nav>
      </div>
    </footer>
  );
}
