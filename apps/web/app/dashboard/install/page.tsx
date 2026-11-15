import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../../components/dashboard';

export const metadata: Metadata = { title: 'Install' };

export default async function InstallPage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Install"
      emptyTitle="Nothing to install yet"
      description="Create a project to get the script tag for your site."
    />
  );
}
