import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8');

interface Rule {
  selectors: string[];
  decls: Map<string, string>;
}

/** Top-level style rules of globals.css (comments and at-rules skipped). */
function parseRules(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^@[^{};]*;/gm, '');
  const rules: Rule[] = [];
  for (const match of text.matchAll(/(?<=^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/g)) {
    const selectors = match[1]!.split(',').map((s) => s.trim());
    const decls = new Map<string, string>();
    for (const decl of match[2]!.split(';')) {
      const i = decl.indexOf(':');
      if (i > 0) decls.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
    }
    rules.push({ selectors, decls });
  }
  return rules;
}

const rules = parseRules(css);

/** Every declaration of `prop` in a rule whose selector list includes `selector`, in order. */
function valuesFor(selector: string, prop: string): string[] {
  return rules
    .filter((r) => r.selectors.includes(selector) && r.decls.has(prop))
    .map((r) => r.decls.get(prop)!);
}

const TOKENS = new Set(
  [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!),
);

describe('page scrollbar on dark-theme pages', () => {
  it('gives the root a dark color-scheme when a theme-dark layout is present', () => {
    expect(valuesFor('html:has(.theme-dark)', 'color-scheme')).toEqual(['dark']);
  });

  it('gives that root the dark tokens, the same block as .theme-dark', () => {
    const block = rules.find(
      (r) => r.selectors.includes('html:has(.theme-dark)') && r.decls.has('--bg'),
    );
    const dark = rules.find((r) => r.selectors.includes('.theme-dark') && r.decls.has('--bg'));
    expect(block).toBeDefined();
    expect(block).toBe(dark);
  });

  it.each(['html:has(.theme-dark)', '.theme-dark'])(
    'sets scrollbar-color on %s from theme tokens only',
    (selector) => {
      const [value] = valuesFor(selector, 'scrollbar-color');
      expect(value).toBeDefined();
      const parts = value!.split(/\s+(?![^(]*\))/);
      expect(parts).toHaveLength(2);
      for (const part of parts) {
        const token = /^var\((--[a-z0-9-]+)\)$/.exec(part)?.[1];
        expect(token, `${part} must be var(--token)`).toBeDefined();
        expect(TOKENS.has(token!), `${token} must be a defined token`).toBe(true);
      }
    },
  );

  it('keeps light pages light: :root stays color-scheme light, with no scrollbar override', () => {
    expect(valuesFor(':root', 'color-scheme')).toEqual(['light']);
    expect(valuesFor(':root', 'scrollbar-color')).toEqual([]);
    expect(valuesFor('.theme-light', 'scrollbar-color')).toEqual([]);
  });

  it('adds no new color values outside the token blocks', () => {
    const tokenBlocks = rules.filter((r) => r.decls.has('--bg'));
    for (const rule of rules.filter((r) => !tokenBlocks.includes(r))) {
      for (const [prop, value] of rule.decls) {
        expect(value, `${rule.selectors.join(', ')} { ${prop} }`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
      }
    }
  });
});
