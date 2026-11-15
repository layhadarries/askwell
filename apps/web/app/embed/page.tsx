import type { Metadata } from 'next';
import { ChatPanel, getEmbedConfig } from '../../components/embed';

export const metadata: Metadata = { title: 'Chat', robots: { index: false } };

/** The chat panel inside the widget's iframe: /embed?key=pk_... (public, no Clerk). */
export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await searchParams;
  const config = await getEmbedConfig(key);
  // Bad key: render nothing (§6.5).
  if (!config) return null;
  return <ChatPanel config={config} />;
}
