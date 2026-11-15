'use client';

import { useEffect, useState } from 'react';
import { Button } from '../ui';

export type CopyState = 'idle' | 'copied' | 'failed';

export const COPY_LABELS: Record<CopyState, string> = {
  idle: 'Copy',
  copied: 'Copied',
  failed: 'Copy failed. Select the text instead.',
};

interface ClipboardLike {
  writeText(text: string): Promise<void>;
}

/** Copies `text`; 'failed' when the clipboard API is missing or refuses. */
export async function copyText(text: string, clipboard?: ClipboardLike): Promise<CopyState> {
  if (!clipboard) return 'failed';
  try {
    await clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={async () =>
          setState(await copyText(text, typeof navigator === 'undefined' ? undefined : navigator.clipboard))
        }
      >
        {state === 'copied' ? COPY_LABELS.copied : COPY_LABELS.idle}
      </Button>
      <span role="status" aria-live="polite" className="text-sm text-fg-muted">
        {state === 'idle' ? '' : COPY_LABELS[state]}
      </span>
    </div>
  );
}
