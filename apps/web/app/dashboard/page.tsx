import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../components/dashboard';

export const metadata: Metadata = { title: 'Projects' };

export default async function DashboardPage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Projects"
      emptyTitle="No projects yet"
      description="Projects you create show up here. Each one gets its own bot, knowledge and widget."
    />
  );
}
