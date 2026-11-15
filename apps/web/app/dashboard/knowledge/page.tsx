import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../../components/dashboard';

export const metadata: Metadata = { title: 'Knowledge' };

export default async function KnowledgePage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Knowledge"
      emptyTitle="No knowledge yet"
      description="Paste text or upload a PDF. Your bot answers from what you add here."
    />
  );
}
