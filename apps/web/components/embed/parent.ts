import { parseWidgetMessage, widgetMessage, type WidgetMessage } from '@askwell/shared';

interface WindowLike {
  parent: unknown;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  removeEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
}

interface ParentLike {
  postMessage(message: WidgetMessage, targetOrigin: string): void;
}

/** The http(s) origin of a URL, or null. Never '*', never 'null'. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Talks to the loader on the parent page with the shared message types.
 *
 * The target origin comes from document.referrer (the page that opened the
 * iframe) or from a valid `ready` message that really came from window.parent.
 * Until one is known, nothing is posted. It never posts to '*'.
 */
export function createParentChannel(win: WindowLike, referrer: string) {
  const parent = win.parent as ParentLike | null;
  const framed = !!parent && parent !== (win as unknown);
  let targetOrigin = originOf(referrer);
  let readySent = false;

  function post(message: WidgetMessage): boolean {
    if (!framed || !targetOrigin) return false;
    parent.postMessage(message, targetOrigin);
    return true;
  }

  function sendReady() {
    if (!readySent) readySent = post(widgetMessage('ready'));
  }

  function onMessage(event: MessageEvent) {
    if (event.source !== win.parent) return;
    const message = parseWidgetMessage(event.data);
    const origin = originOf(event.origin);
    if (message?.type !== 'ready' || !origin) return;
    targetOrigin = origin;
    sendReady();
  }

  return {
    start() {
      win.addEventListener('message', onMessage);
      sendReady();
    },
    stop() {
      win.removeEventListener('message', onMessage);
    },
    close: () => post(widgetMessage('close')),
    resize: (height: number) => post(widgetMessage('resize', { height })),
    /** For tests. */
    get targetOrigin() {
      return targetOrigin;
    },
  };
}

export type ParentChannel = ReturnType<typeof createParentChannel>;
