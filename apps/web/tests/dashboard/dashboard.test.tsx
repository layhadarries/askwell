import { readdirSync, readFileSync, statSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { DashboardNav, NAV_ITEMS, PlaceholderPage, isActive } = await import(
  '../../components/dashboard'
);

const EXPECTED = [
  ['Projects', '/dashboard'],
  ['Knowledge', '/dashboard/knowledge'],
  ['Conversations', '/dashboard/conversations'],
  ['Customize', '/dashboard/customize'],
  ['Install', '/dashboard/install'],
  ['Billing', '/dashboard/billing'],
];

describe('dashboard nav', () => {
  it('lists the six sections in order', () => {
    expect(NAV_ITEMS.map((i) => [i.label, i.href])).toEqual(EXPECTED);
  });

  it('renders a link to each route', () => {
    const html = renderToStaticMarkup(<DashboardNav />);
    for (const [label, href] of EXPECTED) {
      expect(html).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`));
    }
  });

  it('marks only the current page', () => {
    pathname = '/dashboard/knowledge';
    const html = renderToStaticMarkup(<DashboardNav />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const current = /<a[^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? '';
    expect(current).toContain('href="/dashboard/knowledge"');
    pathname = '/dashboard';
  });

  it('isActive keeps Projects to /dashboard itself', () => {
    expect(isActive('/dashboard', '/dashboard')).toBe(true);
    expect(isActive('/dashboard', '/dashboard/knowledge')).toBe(false);
    expect(isActive('/dashboard/knowledge', '/dashboard/knowledge/abc')).toBe(true);
    expect(isActive('/dashboard/install', '/dashboard/installx')).toBe(false);
  });
});

describe('placeholder pages', () => {
  it('render a heading and an empty state', () => {
    const html = renderToStaticMarkup(
      <PlaceholderPage title="Knowledge" emptyTitle="None" description="Add some" />,
    );
    expect(html).toContain('<h1');
    expect(html).toContain('data-state="empty"');
  });

  const root = new URL('../../app/dashboard/', import.meta.url);
  const segments = ['', ...readdirSync(root).filter((d) => statSync(new URL(d, root)).isDirectory())];
  const read = (seg: string, file: string) =>
    readFileSync(new URL(`${seg ? `${seg}/` : ''}${file}`, root), 'utf8');

  it('exist for every nav route', () => {
    expect(segments.map((s) => (s ? `/dashboard/${s}` : '/dashboard')).sort()).toEqual(
      EXPECTED.map(([, href]) => href).sort(),
    );
  });

  it.each(segments)('/dashboard/%s calls auth.protect() and has loading and error files', (seg) => {
    expect(read(seg, 'page.tsx')).toContain('await auth.protect()');
    expect(read(seg, 'loading.tsx')).toContain('SegmentLoading');
    const error = read(seg, 'error.tsx');
    expect(error.startsWith("'use client'")).toBe(true);
    expect(error).toContain('SegmentError');
  });

  it('the layout calls auth.protect() too', () => {
    expect(read('', 'layout.tsx')).toContain('await auth.protect()');
  });
});
