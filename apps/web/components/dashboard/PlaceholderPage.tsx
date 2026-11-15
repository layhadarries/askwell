import { EmptyState } from '../ui';

/** Heading plus an empty state, for sections that later tasks build out. */
export function PlaceholderPage({
  title,
  emptyTitle,
  description,
}: {
  title: string;
  emptyTitle: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <EmptyState title={emptyTitle} description={description} />
    </div>
  );
}
