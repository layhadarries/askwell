import type { ChatMessage } from './chat';

/** Every message renders as plain text (React escapes it). Never HTML. */
export function MessageList({
  messages,
  typing,
  accent,
}: {
  messages: ChatMessage[];
  typing: boolean;
  accent: string;
}) {
  return (
    <ol className="flex flex-col gap-2" aria-live="polite" aria-label="Messages">
      {messages.map((m) => (
        <li
          key={m.id}
          data-role={m.role}
          className={`max-w-[85%] rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap ${
            m.role === 'visitor'
              ? 'self-end text-white'
              : 'self-start border border-border bg-glass text-fg'
          }`}
          style={m.role === 'visitor' ? { backgroundColor: accent } : undefined}
        >
          {m.text}
        </li>
      ))}
      {typing ? (
        <li
          data-state="typing"
          className="self-start rounded-lg border border-border bg-glass px-3 py-2 text-sm text-fg-muted"
        >
          <span className="sr-only">Typing…</span>
          <span aria-hidden="true" className="inline-flex gap-1">
            <span className="size-1.5 animate-pulse rounded-full bg-fg-muted" />
            <span className="size-1.5 animate-pulse rounded-full bg-fg-muted [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-fg-muted [animation-delay:300ms]" />
          </span>
        </li>
      ) : null}
    </ol>
  );
}
