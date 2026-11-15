import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../../components/dashboard';

export const metadata: Metadata = { title: 'Customize' };

export default async function CustomizePage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Customize"
      emptyTitle="Nothing to customize yet"
      description="Change the widget’s color, position, label and more. A Pro feature."
    />
  );
}
