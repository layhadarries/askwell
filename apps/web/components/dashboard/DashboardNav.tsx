'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, isActive } from './nav';

/**
 * Vertical list beside the content on wide screens; a compact bar that
 * scrolls sideways on its own (not the page) on narrow ones.
 */
export function DashboardNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="Dashboard">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-md px-3 text-sm whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  active
                    ? 'bg-accent font-medium text-accent-fg'
                    : 'text-fg-muted hover:bg-border hover:text-fg'
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
