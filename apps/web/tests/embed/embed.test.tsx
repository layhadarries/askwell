import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  MAX_MESSAGE_LENGTH,
  MOCK_REPLY,
  parseWidgetMessage,
  type WidgetConfig,
} from '@askwell/shared';
import {
  ChatPanel,
  MessageList,
  TYPING_MS,
  VISITOR_ID_KEY,
  cleanMessage,
  createChat,
  createParentChannel,
  getEmbedConfig,
  getVisitorId,
  originOf,
  resetMemoryVisitorId,
  type ChatState,
} from '../../components/embed';
import { FRAME_HEADERS } from '../../next.config';

const config: WidgetConfig = { ...DEFAULT_WIDGET_CONFIG };

describe('chat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the visitor message, then typing, then MOCK_REPLY after ~800ms', async () => {
    const states: ChatState[] = [];
    const chat = createChat((s) => states.push(s));
    const done = chat.send('  Do you ship to Canada?  ');

    expect(chat.state.messages).toEqual([{ id: 1, role: 'visitor', text: 'Do you ship to Canada?' }]);
    expect(chat.state.typing).toBe(true);

    await vi.advanceTimersByTimeAsync(TYPING_MS - 1);
    expect(chat.state.typing).toBe(true);
    expect(chat.state.messages).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(chat.state.typing).toBe(false);
    expect(chat.state.messages.at(-1)).toEqual({ id: 2, role: 'bot', text: MOCK_REPLY });
    expect(TYPING_MS).toBe(800);

    const html = renderToStaticMarkup(<MessageList {...chat.state} accent="#000000" />);
    expect(html.indexOf('Do you ship to Canada?')).toBeLessThan(html.indexOf('Thanks for your message'));
    expect(states.map((s) => s.typing)).toEqual([true, false]);
  });

  it('renders the typing state', () => {
    const html = renderToStaticMarkup(<MessageList messages={[]} typing accent="#000000" />);
    expect(html).toContain('data-state="typing"');
  });

  it('rejects empty, too-long, and concurrent messages', async () => {
    const chat = createChat(() => {});
    expect(await chat.send('   ')).toBe(false);
    expect(await chat.send('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false);
    expect(cleanMessage('x'.repeat(MAX_MESSAGE_LENGTH))).toHaveLength(MAX_MESSAGE_LENGTH);
    const first = chat.send('one');
    expect(await chat.send('two')).toBe(false);
    await vi.runAllTimersAsync();
    await first;
    expect(chat.state.messages.map((m) => m.text)).toEqual(['one', MOCK_REPLY]);
  });

  it('makes no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const chat = createChat(() => {});
    const p = chat.send('hi');
    await vi.runAllTimersAsync();
    await p;
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('messages render as text, never HTML', () => {
  it('escapes HTML in visitor and bot messages', () => {
    const evil = '<img src=x onerror=alert(1)><b>hi</b>';
    const html = renderToStaticMarkup(
      <MessageList
        messages={[
          { id: 1, role: 'visitor', text: evil },
          { id: 2, role: 'bot', text: evil },
        ]}
        typing={false}
        accent="#000000"
      />,
    );
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html.match(/&lt;img src=x onerror=alert\(1\)&gt;&lt;b&gt;hi&lt;\/b&gt;/g)).toHaveLength(2);
  });
});

describe('panel', () => {
  it('shows the header text, input limit and badge when config says so', () => {
    const html = renderToStaticMarkup(<ChatPanel config={{ ...config, showBadge: true }} />);
    expect(html).toContain(config.headerText);
    expect(html).toContain(`maxLength="${MAX_MESSAGE_LENGTH}"`);
    expect(html).toContain(`Powered by ${APP_NAME}`);
  });

  it('hides the badge when config says so', () => {
    const html = renderToStaticMarkup(<ChatPanel config={{ ...config, showBadge: false }} />);
    expect(html).not.toContain('Powered by');
    expect(html).not.toContain('data-badge');
  });

  it('has a close button', () => {
    expect(renderToStaticMarkup(<ChatPanel config={config} />)).toContain('aria-label="Close chat"');
  });
});

describe('config', () => {
  it('returns a widget config for a well-formed key and null otherwise', async () => {
    expect(await getEmbedConfig('pk_abc')).toEqual(DEFAULT_WIDGET_CONFIG);
    for (const bad of [undefined, '', 'abc', ['pk_a', 'pk_b'], 'pk_' + 'x'.repeat(200)]) {
      expect(await getEmbedConfig(bad)).toBeNull();
    }
  });
});

describe('visitor ID', () => {
  beforeEach(() => resetMemoryVisitorId());

  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('creates a random UUID, stores it and reuses it across visits', () => {
    const s = memoryStorage();
    const id = getVisitorId(s);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.m.get(VISITOR_ID_KEY)).toBe(id);
    expect(getVisitorId(s)).toBe(id);
  });

  it('replaces a malformed stored value', () => {
    const s = memoryStorage();
    s.m.set(VISITOR_ID_KEY, '<script>');
    const id = getVisitorId(s);
    expect(id).not.toBe('<script>');
    expect(s.m.get(VISITOR_ID_KEY)).toBe(id);
  });

  it('falls back to one in-memory ID when storage throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const a = getVisitorId(throwing);
    const b = getVisitorId(throwing);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
    expect(getVisitorId(null)).toBe(a);
  });

  it('falls back when only setItem throws (storage full)', () => {
    const id = getVisitorId({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } });
    expect(getVisitorId(null)).toBe(id);
  });
});

describe('parent messages', () => {
  function fakeWindow() {
    const posts: [unknown, string][] = [];
    const parent = { postMessage: (m: unknown, o: string) => posts.push([m, o]) };
    let listener: ((e: MessageEvent) => void) | null = null;
    const win = {
      parent,
      addEventListener: (_: 'message', fn: (e: MessageEvent) => void) => (listener = fn),
      removeEventListener: () => (listener = null),
    };
    const dispatch = (e: Partial<MessageEvent>) => listener?.(e as MessageEvent);
    return { win, parent, posts, dispatch };
  }

  it('posts ready, resize and close as shared types to the referrer origin', () => {
    const { win, posts } = fakeWindow();
    const c = createParentChannel(win, 'https://shop.example.com/products?id=1');
    c.start();
    c.resize(480);
    c.close();
    expect(posts.map(([m]) => parseWidgetMessage(m)?.type)).toEqual(['ready', 'resize', 'close']);
    expect(posts.every(([m]) => parseWidgetMessage(m) !== null)).toBe(true);
    expect(posts.every(([, o]) => o === 'https://shop.example.com')).toBe(true);
  });

  it('never targets "*" and posts nothing without a known origin', () => {
    const { win, posts } = fakeWindow();
    const c = createParentChannel(win, '');
    c.start();
    c.resize(300);
    c.close();
    expect(posts).toHaveLength(0);
    expect(c.targetOrigin).toBeNull();
  });

  it('learns the origin from a valid ready message sent by window.parent', () => {
    const { win, parent, posts, dispatch } = fakeWindow();
    const c = createParentChannel(win, '');
    c.start();
    // Not from the parent: ignored.
    dispatch({ source: {} as Window, origin: 'https://evil.example', data: { source: 'askwell', version: 1, type: 'ready' } });
    // From the parent but not a valid widget message: ignored.
    dispatch({ source: parent as unknown as Window, origin: 'https://shop.example', data: { type: 'ready' } });
    expect(posts).toHaveLength(0);
    dispatch({ source: parent as unknown as Window, origin: 'https://shop.example', data: { source: 'askwell', version: 1, type: 'ready' } });
    expect(c.targetOrigin).toBe('https://shop.example');
    c.close();
    expect(posts.map(([m, o]) => [parseWidgetMessage(m)?.type, o])).toEqual([
      ['ready', 'https://shop.example'],
      ['close', 'https://shop.example'],
    ]);
  });

  it('re-sends the last resize once the handshake completes', () => {
    const { win, parent, posts, dispatch } = fakeWindow();
    const c = createParentChannel(win, '');
    c.start();
    c.resize(300);
    c.resize(420);
    expect(posts).toHaveLength(0);
    dispatch({ source: parent as unknown as Window, origin: 'https://shop.example', data: { source: 'askwell', version: 1, type: 'ready' } });
    expect(posts.map(([m]) => parseWidgetMessage(m))).toEqual([
      { source: 'askwell', version: 1, type: 'ready' },
      { source: 'askwell', version: 1, type: 'resize', height: 420 },
    ]);
  });

  it('does not post when not inside a frame', () => {
    const posts: unknown[] = [];
    const win: { parent: unknown; addEventListener: () => void; removeEventListener: () => void; postMessage: (m: unknown) => void } = {
      parent: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      postMessage: (m) => posts.push(m),
    };
    win.parent = win;
    const c = createParentChannel(win, 'https://shop.example');
    c.start();
    c.close();
    expect(posts).toHaveLength(0);
  });

  it('originOf accepts only http(s) URLs', () => {
    expect(originOf('https://a.example/x')).toBe('https://a.example');
    expect(originOf('*')).toBeNull();
    expect(originOf('null')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('file:///etc/passwd')).toBeNull();
  });
});

describe('frame-ancestors headers', () => {
  const csp = (source: string) =>
    FRAME_HEADERS.find((r) => r.source === source)?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;

  it("every route sends frame-ancestors 'self'; /embed sends frame-ancestors *, last so it wins", () => {
    expect(csp('/:path*')).toBe("frame-ancestors 'self'");
    expect(csp('/embed')).toBe('frame-ancestors *');
    expect(FRAME_HEADERS.at(-1)?.source).toBe('/embed');
  });
});
