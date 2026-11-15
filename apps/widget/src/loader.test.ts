import { Window as HappyWindow } from 'happy-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from '@askwell/shared';
import { GUARD, boot, type Mounted } from './loader';

const BASE = 'https://app.askwell.example';
const KEY = 'pk_live_123';
const windows: HappyWindow[] = [];

function setup(attrs: Record<string, string | null> = { 'data-key': KEY }, src = `${BASE}/widget.js`) {
  const happy = new HappyWindow({
    url: 'https://shop.example.com/products',
    settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true },
  });
  windows.push(happy);
  const win = happy as unknown as Window & typeof globalThis;
  const doc = win.document;
  const script = doc.createElement('script');
  script.setAttribute('src', src);
  for (const [k, v] of Object.entries(attrs)) if (v !== null) script.setAttribute(k, v);
  doc.body.append(script);
  return { win, doc, script };
}

function fetchReturning(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const config: WidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  buttonColor: '#123abc',
  position: 'top-left',
  label: 'Questions?',
  animation: 'slide',
};

async function mounted(cfg: WidgetConfig = config) {
  const env = setup();
  const fetch = fetchReturning(cfg);
  const m = (await boot(env.script as unknown as HTMLScriptElement, { win: env.win, fetch })) as Mounted;
  return { ...env, fetch, m };
}

const iframeOf = (m: Mounted) => m.root.querySelector('iframe') as HTMLIFrameElement;

/** happy-dom gives an unloaded iframe no window; give it a stand-in. */
function openWithFrame(m: Mounted) {
  m.open();
  const frameWin = { postMessage: vi.fn() };
  Object.defineProperty(iframeOf(m), 'contentWindow', { value: frameWin, configurable: true });
  return frameWin;
}

function postFromIframe(win: Window & typeof globalThis, m: Mounted, data: unknown, overrides: Partial<{ origin: string; source: unknown }> = {}) {
  const event = new win.MessageEvent('message', {
    data,
    origin: overrides.origin ?? BASE,
    source: ('source' in overrides ? overrides.source : iframeOf(m).contentWindow) as never,
  });
  win.dispatchEvent(event);
}

const msg = (type: string, extra: object = {}) => ({ source: 'askwell', version: 1, type, ...extra });

afterEach(async () => {
  for (const w of windows.splice(0)) await w.happyDOM.close();
});

describe('nothing renders', () => {
  it.each([
    ['no data-key', { 'data-key': null }],
    ['empty key', { 'data-key': '' }],
    ['bad prefix', { 'data-key': 'sk_123' }],
    ['too long', { 'data-key': 'pk_' + 'x'.repeat(200) }],
  ])('%s: no fetch, no element', async (_name, attrs) => {
    const { win, doc, script } = setup(attrs);
    const fetch = fetchReturning(config);
    expect(await boot(script as unknown as HTMLScriptElement, { win, fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(doc.querySelector('[data-askwell]')).toBeNull();
  });

  it.each([
    ['404', async () => new Response('{}', { status: 404 })],
    ['network error', async () => { throw new TypeError('Failed to fetch'); }],
    ['invalid JSON', async () => new Response('not json', { status: 200 })],
    ['invalid config', async () => new Response(JSON.stringify({ ...config, buttonColor: 'red' }), { status: 200 })],
  ])('%s: renders nothing and throws nothing', async (_name, impl) => {
    const { win, doc, script } = setup();
    await expect(boot(script as unknown as HTMLScriptElement, { win, fetch: vi.fn(impl) as unknown as typeof fetch })).resolves.toBeNull();
    expect(doc.querySelector('[data-askwell]')).toBeNull();
  });

  it('no script element: nothing', async () => {
    const { win } = setup();
    expect(await boot(null, { win, fetch: fetchReturning(config) })).toBeNull();
  });
});

describe('button', () => {
  it('fetches the config from the script origin and renders in a shadow root with config styles', async () => {
    const { doc, fetch, m } = await mounted();
    expect(fetch).toHaveBeenCalledWith(`${BASE}/api/widget/config?key=${KEY}`, { credentials: 'omit' });
    const hosts = doc.querySelectorAll('[data-askwell]');
    expect(hosts).toHaveLength(1);
    // Closed root: the page can't reach inside.
    expect((hosts[0] as HTMLElement).shadowRoot).toBeNull();
    const button = m.root.querySelector('button.button') as HTMLButtonElement;
    expect(button.textContent).toContain('Questions?');
    expect(button.style.backgroundColor).toMatch(/#123abc|rgb\(18, 58, 188\)/i);
    expect(m.root.querySelector('.wrap')?.classList.contains('top-left')).toBe(true);
    expect(m.root.querySelector('.panel')?.classList.contains('slide')).toBe(true);
    // Styles live inside the shadow root, none on the page.
    expect(m.root.querySelector('style')).not.toBeNull();
    expect(doc.head.querySelector('style')).toBeNull();
    expect(doc.querySelectorAll('style')).toHaveLength(0);
  });

  it('renders the label as text, never HTML', async () => {
    const { m } = await mounted({ ...config, label: '<img src=x onerror=alert(1)>' });
    expect(m.root.querySelector('img')).toBeNull();
    expect(m.root.querySelector('button.button')?.textContent).toContain('<img src=x');
  });

  it('loading twice renders one button and sets only the guard global', async () => {
    const { win, doc, script } = setup();
    const before = new Set(Object.keys(win));
    const fetch = fetchReturning(config);
    const [a, b] = await Promise.all([
      boot(script as unknown as HTMLScriptElement, { win, fetch }),
      boot(script as unknown as HTMLScriptElement, { win, fetch }),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await boot(script as unknown as HTMLScriptElement, { win, fetch })).toBeNull();
    expect(doc.querySelectorAll('[data-askwell]')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(Object.keys(win).filter((k) => !before.has(k))).toEqual([GUARD]);
  });

  it('uses the script origin as base, ignoring paths and the page origin', async () => {
    const { win, script } = setup({ 'data-key': KEY }, `${BASE}/static/v1/widget.js?x=1`);
    const fetch = fetchReturning(config);
    const m = await boot(script as unknown as HTMLScriptElement, { win, fetch });
    expect(m?.base).toBe(BASE);
  });
});

describe('panel', () => {
  it('click opens an iframe at /embed?key=…, click again closes it', async () => {
    const { m } = await mounted();
    const button = m.root.querySelector('button.button') as HTMLButtonElement;
    const panel = m.root.querySelector('.panel') as HTMLElement;
    expect(panel.hidden).toBe(true);
    expect(m.root.querySelector('iframe')).toBeNull();
    button.click();
    expect(panel.hidden).toBe(false);
    expect(iframeOf(m).getAttribute('src')).toBe(`${BASE}/embed?key=${KEY}`);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(panel.hidden).toBe(true);
    button.click();
    expect(m.root.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('has a fallback close button', async () => {
    const { m } = await mounted();
    m.open();
    (m.root.querySelector('button.close') as HTMLButtonElement).click();
    expect((m.root.querySelector('.panel') as HTMLElement).hidden).toBe(true);
  });

  it('goes full screen below 480px (CSS)', async () => {
    const { m } = await mounted();
    const css = m.root.querySelector('style')?.textContent ?? '';
    expect(css).toMatch(/@media \(max-width: 479\.98px\)\s*\{\s*\.panel \{ position: fixed; inset: 0;/);
  });
});

describe('messages', () => {
  it('close and resize from the iframe work', async () => {
    const { win, m } = await mounted();
    openWithFrame(m);
    const panel = m.root.querySelector('.panel') as HTMLElement;
    postFromIframe(win, m, msg('resize', { height: 420 }));
    expect(panel.style.height).toBe('420px');
    postFromIframe(win, m, msg('close'));
    expect(panel.hidden).toBe(true);
  });

  it('ignores messages from another origin or another window', async () => {
    const { win, m } = await mounted();
    openWithFrame(m);
    const panel = m.root.querySelector('.panel') as HTMLElement;
    postFromIframe(win, m, msg('close'), { origin: 'https://evil.example' });
    postFromIframe(win, m, msg('close'), { source: win });
    postFromIframe(win, m, msg('close'), { source: null });
    expect(panel.hidden).toBe(false);
  });

  it('ignores malformed messages', async () => {
    const { win, m } = await mounted();
    openWithFrame(m);
    const panel = m.root.querySelector('.panel') as HTMLElement;
    for (const bad of [
      { type: 'close' },
      msg('close', { extra: 1 }),
      { ...msg('close'), version: 2 },
      msg('resize', { height: 999999 }),
      msg('resize', { height: '400' }),
      'close',
      null,
    ]) {
      postFromIframe(win, m, bad);
    }
    expect(panel.hidden).toBe(false);
    expect(panel.style.height).toBe('');
  });

  it('shows unread count on the button while closed', async () => {
    const { win, m } = await mounted();
    openWithFrame(m);
    m.close();
    const badge = m.root.querySelector('.badge') as HTMLElement;
    postFromIframe(win, m, msg('unread', { count: 3 }));
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('3');
    postFromIframe(win, m, msg('unread', { count: 0 }));
    expect(badge.hidden).toBe(true);
  });

  it('answers ready with ready to the base origin, never "*"', async () => {
    const { win, m } = await mounted();
    const { postMessage: post } = openWithFrame(m);
    postFromIframe(win, m, msg('ready'));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual([msg('ready'), BASE]);
    expect(post.mock.calls.every((c) => c[1] !== '*')).toBe(true);
  });

  it('ignores everything before the iframe has a window (null source)', async () => {
    const { win, m } = await mounted();
    m.open();
    postFromIframe(win, m, msg('close'), { source: null });
    expect((m.root.querySelector('.panel') as HTMLElement).hidden).toBe(false);
  });
});

describe('isolation and timing', () => {
  it("host page styles don't reach the button, and widget styles don't leak out", async () => {
    const { win, doc, m } = await mounted();
    const pageStyle = doc.createElement('style');
    pageStyle.textContent = 'button { background-color: rgb(255, 0, 0) !important; } .button { display: none !important; }';
    doc.head.append(pageStyle);
    const pageButton = doc.createElement('button');
    pageButton.className = 'button';
    doc.body.append(pageButton);

    const button = m.root.querySelector('button.button') as HTMLButtonElement;
    const inside = win.getComputedStyle(button);
    // Proves computed styles see the shadow root's own sheet.
    expect(inside.borderRadius).toBe('999px');
    expect(inside.display).not.toBe('none');
    expect(inside.backgroundColor).not.toBe('rgb(255, 0, 0)');
    // The page's own .button gets the page rule, not the widget's pill style.
    expect(win.getComputedStyle(pageButton).borderRadius).not.toBe('999px');
    // The host element resists page rules that match it.
    expect(m.host.style.getPropertyPriority('all')).toBe('important');
  });

  it('waits for <body> when loaded from <head>', async () => {
    const env = setup();
    const body = env.doc.body;
    body.remove();
    const pending = boot(env.script as unknown as HTMLScriptElement, { win: env.win, fetch: fetchReturning(config) });
    await new Promise((r) => setTimeout(r, 0));
    expect(env.doc.querySelector('[data-askwell]')).toBeNull();
    env.doc.documentElement.append(body);
    env.doc.dispatchEvent(new env.win.Event('DOMContentLoaded'));
    const m = await pending;
    expect(m).not.toBeNull();
    expect(env.doc.body.querySelector('[data-askwell]')).not.toBeNull();
  });

  it('says ready to the iframe on load, targeting the app origin only', async () => {
    const { win, m } = await mounted();
    const { postMessage: post } = openWithFrame(m);
    iframeOf(m).dispatchEvent(new win.Event('load'));
    expect(post).toHaveBeenCalledWith(msg('ready'), BASE);
  });
});
