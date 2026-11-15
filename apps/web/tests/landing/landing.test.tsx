import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_NAME, PLAN_LIMITS, PUBLIC_KEY_PREFIX } from '@askwell/shared';
import Home from '../../app/page';
import { Pricing, SAMPLE_SNIPPET, planRows } from '../../components/landing';

const html = renderToStaticMarkup(<Home />);
const value = (plan: 'free' | 'pro', label: string) =>
  planRows(plan).find((r) => r.label === label)?.value;

describe('pricing rows', () => {
  it('Free shows the exact PLAN_LIMITS numbers (§5: 1 / 100 / 3)', () => {
    expect(value('free', 'Projects')).toBe(String(PLAN_LIMITS.free.projects));
    expect(value('free', 'Messages / month per project')).toBe(
      String(PLAN_LIMITS.free.messagesPerMonth),
    );
    expect(value('free', 'Knowledge sources per project')).toBe(
      String(PLAN_LIMITS.free.knowledgeSources),
    );
    expect([value('free', 'Projects'), value('free', 'Messages / month per project'), value('free', 'Knowledge sources per project')]).toEqual(['1', '100', '3']);
  });

  it('Pro shows the exact PLAN_LIMITS numbers (§5: 5 / 2,000 / 25)', () => {
    expect(value('pro', 'Projects')).toBe(PLAN_LIMITS.pro.projects.toLocaleString('en-US'));
    expect(value('pro', 'Messages / month per project')).toBe(
      PLAN_LIMITS.pro.messagesPerMonth.toLocaleString('en-US'),
    );
    expect(value('pro', 'Knowledge sources per project')).toBe(
      PLAN_LIMITS.pro.knowledgeSources.toLocaleString('en-US'),
    );
    expect([value('pro', 'Projects'), value('pro', 'Messages / month per project'), value('pro', 'Knowledge sources per project')]).toEqual(['5', '2,000', '25']);
  });

  it('widget rows match §5', () => {
    expect(planRows('free').slice(3).map((r) => r.value)).toEqual([
      'Default',
      'Bottom right',
      'Default',
      'Fade',
      'Default',
      'Shown',
    ]);
    expect(planRows('pro').slice(3).map((r) => r.value)).toEqual([
      'Any',
      'Any corner',
      'Custom',
      'Fade / Slide / Scale',
      'Custom',
      'Hidden',
    ]);
  });

  it('renders both cards with the numbers and no Pro price', () => {
    const pricing = renderToStaticMarkup(<Pricing />);
    expect(pricing).toContain('data-plan="free"');
    expect(pricing).toContain('data-plan="pro"');
    expect(pricing).toContain('2,000');
    expect(pricing).toMatch(/[Uu]pgrade/);
    expect(pricing).not.toMatch(/[$€£]\s?\d|\/\s?mo\b|per month\b/i);
  });
});

describe('landing page', () => {
  it('has the sections in order', () => {
    const order = ['how-it-works', 'demo', 'pricing', 'install'].map((id) =>
      html.indexOf(`id="${id}"`),
    );
    expect(html.indexOf('<h1')).toBeLessThan(order[0]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(html.indexOf('<footer')).toBeGreaterThan(order[3]!);
  });

  it('links every "Start free" CTA to /sign-up', () => {
    const ctas = [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>Start free<\/a>/g)];
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas.every((m) => m[1] === '/sign-up')).toBe(true);
  });

  it('uses APP_NAME for the name and badge text', () => {
    expect(html).toContain(`${APP_NAME} · AI support chat`);
    expect(html).toContain(`Powered by ${APP_NAME}`);
  });

  it('marks the demo widget placeholder and loads no widget', () => {
    expect(html).toContain('data-placeholder="demo-widget"');
    expect(html).not.toContain('<script');
  });

  it('shows the install snippet as text with a placeholder key', () => {
    expect(SAMPLE_SNIPPET).toContain(`data-key="${PUBLIC_KEY_PREFIX}your_project_key"`);
    expect(html).toContain('&lt;script src=');
  });

  it('is dark', () => {
    expect(html).toContain('theme-dark');
  });
});

describe('motion', () => {
  const css = readFileSync(new URL('../../components/landing/landing.css', import.meta.url), 'utf8');
  it('only animates when the visitor allows motion', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
    expect(start).toBeGreaterThan(-1);
    expect(css.indexOf('.landing-enter {')).toBeGreaterThan(start);
    expect(css.indexOf('.landing-reveal {')).toBeGreaterThan(start);
  });
});
