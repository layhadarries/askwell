export interface NavItem {
  label: string;
  href: string;
}

/** Dashboard sections, in nav order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Projects', href: '/dashboard' },
  { label: 'Knowledge', href: '/dashboard/knowledge' },
  { label: 'Conversations', href: '/dashboard/conversations' },
  { label: 'Customize', href: '/dashboard/customize' },
  { label: 'Install', href: '/dashboard/install' },
  { label: 'Billing', href: '/dashboard/billing' },
];

/** `/dashboard` is active only on itself; other items also match their subpages. */
export function isActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href || pathname === `${href}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}
