'use client';

import { APP_NAME, MAX_MESSAGE_LENGTH, type WidgetConfig } from '@askwell/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { cleanMessage, createChat, type ChatState } from './chat';
import { MessageList } from './MessageList';
import { createParentChannel, type ParentChannel } from './parent';
import { getVisitorId } from './visitor';

export function ChatPanel({
  config,
  initialState,
}: {
  config: WidgetConfig;
  /** For tests and previews. */
  initialState?: ChatState;
}) {
  const [state, setState] = useState<ChatState>(initialState ?? { messages: [], typing: false });
  const [draft, setDraft] = useState('');
  const chat = useMemo(() => createChat(setState), []);
  const channel = useRef<ParentChannel | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reused on later visits; the chat API takes it from Phase 3.
    getVisitorId();
    const c = createParentChannel(window, document.referrer);
    channel.current = c;
    c.start();
    const el = root.current;
    const observer = el
      ? new ResizeObserver(() => c.resize(Math.max(1, Math.round(el.scrollHeight))))
      : null;
    if (el) observer?.observe(el);
    return () => {
      observer?.disconnect();
      c.stop();
    };
  }, []);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cleanMessage(draft) || state.typing) return;
    const text = draft;
    setDraft('');
    await chat.send(text);
  }

  return (
    <div ref={root} className="theme-light flex h-dvh flex-col text-fg">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h1 className="truncate text-sm font-semibold">{config.headerText}</h1>
        <button
          type="button"
          aria-label="Close chat"
          onClick={() => channel.current?.close()}
          className="flex size-11 items-center justify-center rounded-md text-fg-muted hover:bg-border hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </header>
      <div ref={list} className="flex-1 overflow-y-auto px-3 py-3">
        <MessageList messages={state.messages} typing={state.typing} accent={config.buttonColor} />
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-2">
        <label htmlFor="askwell-message" className="sr-only">
          Your message
        </label>
        <input
          id="askwell-message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Type your question…"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={state.typing || !draft.trim()}
          className="min-h-11 rounded-md px-4 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: config.buttonColor }}
        >
          Send
        </button>
      </form>
      {config.showBadge ? (
        <p data-badge className="pb-2 text-center text-xs text-fg-muted">
          Powered by {APP_NAME}
        </p>
      ) : null}
    </div>
  );
}
