import type { WidgetConfig } from '@askwell/shared';
import { STYLES } from './styles';
import { isPublicKey, message, parseConfig, parseMessage } from './protocol';

/** The one global the loader sets: a guard against loading twice. */
export const GUARD = '__askwellWidget';

export interface Mounted {
  host: HTMLElement;
  root: ShadowRoot;
  base: string;
  key: string;
  open(): void;
  close(): void;
}

interface Deps {
  win: Window & typeof globalThis;
  fetch: typeof fetch;
}

/**
 * Starts the widget for a <script data-key="pk_..." src=".../widget.js">.
 * Resolves to the mounted widget, or null when nothing should render
 * (no/bad key, already loaded, config not found, network error). Never throws.
 */
export async function boot(
  script: HTMLScriptElement | null,
  deps: Deps = { win: window, fetch: window.fetch.bind(window) },
): Promise<Mounted | null> {
  try {
    const { win } = deps;
    const flags = win as unknown as Record<string, unknown>;
    if (!script || flags[GUARD]) return null;
    const key = script.dataset.key;
    if (!isPublicKey(key)) return null;
    const base = new URL(script.src, win.location.href).origin;
    flags[GUARD] = true;
    try {
      const res = await deps.fetch(`${base}/api/widget/config?key=${encodeURIComponent(key)}`, {
        credentials: 'omit',
      });
      const config = res.ok ? parseConfig(await res.json()) : null;
      if (config) {
        await bodyReady(win.document);
        return mount(win, base, key, config);
      }
    } catch {
      // Fall through: nothing mounted.
    }
    // Nothing mounted: let a later insertion of the script try again.
    delete flags[GUARD];
    return null;
  } catch {
    return null;
  }
}

/** Resolves once document.body exists (the script may run from <head>). */
function bodyReady(doc: Document): Promise<void> {
  if (doc.body) return Promise.resolve();
  return new Promise((resolve) =>
    doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
  );
}

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function mount(win: Window, base: string, key: string, config: WidgetConfig): Mounted {
  const doc = win.document;
  const host = el(doc, 'div', { 'data-askwell': '' });
  // Inline !important beats any page rule that matches the host element.
  host.style.setProperty('all', 'initial', 'important');
  host.style.setProperty('display', 'block', 'important');
  const root = host.attachShadow({ mode: 'closed' });

  const style = el(doc, 'style');
  style.textContent = STYLES;
  const wrap = el(doc, 'div', { class: `wrap ${config.position}` });

  const button = el(doc, 'button', { type: 'button', class: 'button', 'aria-expanded': 'false' });
  button.style.backgroundColor = config.buttonColor;
  const label = el(doc, 'span');
  label.textContent = config.label;
  const badge = el(doc, 'span', { class: 'badge', 'aria-label': 'Unread replies' });
  badge.hidden = true;
  button.append(label, badge);

  const panel = el(doc, 'div', { class: `panel ${config.animation}`, role: 'dialog', 'aria-label': config.headerText });
  panel.hidden = true;
  let iframe: HTMLIFrameElement | null = null;

  const setUnread = (count: number) => {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  };

  function open() {
    if (!iframe) {
      iframe = el(doc, 'iframe', {
        src: `${base}/embed?key=${encodeURIComponent(key)}`,
        title: config.headerText,
        allow: '',
      });
      // Start the handshake from our side too: if the host page sends no
      // referrer, the panel can't know our origin until we say ready.
      iframe.addEventListener('load', () => iframe?.contentWindow?.postMessage(message('ready'), base));
      panel.prepend(iframe);
    }
    panel.classList.add('enter');
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setUnread(0);
    // Dialog: move focus inside. close() hands it back to the launcher.
    iframe.focus();
    // Next frame: drop the start state so the configured animation runs.
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => panel.classList.remove('enter')));
  }

  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));

  win.addEventListener('message', (event: MessageEvent) => {
    const frameWin = iframe?.contentWindow;
    // Both checks, and never accept a null source.
    if (event.origin !== base || !frameWin || event.source !== frameWin) return;
    const msg = parseMessage(event.data);
    if (!msg) return;
    switch (msg.type) {
      case 'ready':
        frameWin.postMessage(message('ready'), base);
        break;
      case 'resize':
        panel.style.height = `${msg.height}px`;
        break;
      case 'close':
        close();
        break;
      case 'unread':
        if (panel.hidden) setUnread(msg.count);
        break;
    }
  });

  wrap.append(panel, button);
  root.append(style, wrap);
  doc.body.append(host);
  return { host, root, base, key, open, close };
}
