import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@askwell/shared';
import { Button, EmptyState, ErrorState, GlassPanel, LoadingState } from '../../components/ui';
import { metadata } from '../../app/layout';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

describe('GlassPanel', () => {
  it('renders children and merges className', () => {
    const html = renderToStaticMarkup(<GlassPanel className="extra">hello</GlassPanel>);
    expect(html).toContain('hello');
    expect(html).toContain('backdrop-blur-md');
    expect(html).toContain('extra');
  });
});

describe('Button', () => {
  it('defaults to a primary button of type button', () => {
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain('bg-accent');
    expect(html).toContain('Go');
  });
  it('has a 44px minimum touch target in both directions', () => {
    const html = renderToStaticMarkup(<Button>x</Button>);
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
  });
  it('renders the secondary variant and passes props through', () => {
    const html = renderToStaticMarkup(
      <Button variant="secondary" disabled type="submit">
        Save
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled');
    expect(html).toContain('border-border');
  });
});

describe('states', () => {
  it('EmptyState shows title, description and action', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No chats" description="Nothing yet" action={<Button>Add</Button>} />,
    );
    expect(html).toContain('No chats');
    expect(html).toContain('Nothing yet');
    expect(html).toContain('Add');
  });
  it('LoadingState is a polite status with a default label', () => {
    const html = renderToStaticMarkup(<LoadingState />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading…');
  });
  it('ErrorState is an alert and renders the message as text, not HTML', () => {
    const html = renderToStaticMarkup(<ErrorState message="<b>bad</b>" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
  });
});

describe('design tokens', () => {
  const themes = [
    ['light', /(?::root,\s*)?\.theme-light\s*\{([^}]*)\}/],
    ['dark', /\.theme-dark\s*\{([^}]*)\}/],
  ] as const;
  it.each(themes)('%s theme defines color, radius, shadow and blur tokens', (name, re) => {
    const block = re.exec(css)?.[1] ?? '';
    expect(block).toContain('--bg:');
    expect(block).toContain('--fg:');
    expect(block).toContain('--glass-bg:');
    expect(block).toContain('--accent:');
    expect(block).toContain('--ds-radius-md:');
    expect(block).toContain('--ds-shadow-md:');
    expect(block).toContain('--ds-blur-md:');
    if (name === 'dark') expect(block).toContain('color-scheme: dark');
  });
});

describe('theme boundaries', () => {
  it('body and each theme class paint their own background and text color', () => {
    const rule = /body,\s*\.theme-light,\s*\.theme-dark\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('background: var(--bg)');
    expect(rule).toContain('color: var(--fg)');
  });
});

describe('metadata', () => {
  it('builds the title from APP_NAME', () => {
    expect(metadata.title).toEqual({ default: APP_NAME, template: `%s · ${APP_NAME}` });
  });
});
