'use client';

import { Button, ErrorState, LoadingState } from '../ui';

export function SegmentLoading() {
  return <LoadingState />;
}

/** Body of every dashboard error.tsx (Next 16 passes `retry`). */
export function SegmentError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <ErrorState
      message="This page didn't load. Try again."
      action={<Button onClick={() => retry()}>Try again</Button>}
    />
  );
}
