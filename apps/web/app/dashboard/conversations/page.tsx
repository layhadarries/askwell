import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../../components/dashboard';

export const metadata: Metadata = { title: 'Conversations' };

export default async function ConversationsPage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Conversations"
      emptyTitle="No conversations yet"
      description="Chats from your website visitors show up here."
    />
  );
}
