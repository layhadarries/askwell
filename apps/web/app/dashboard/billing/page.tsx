import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { PlaceholderPage } from '../../../components/dashboard';

export const metadata: Metadata = { title: 'Billing' };

export default async function BillingPage() {
  await auth.protect();
  return (
    <PlaceholderPage
      title="Billing"
      emptyTitle="Billing is coming soon"
      description="Your plan and upgrade options will show here."
    />
  );
}
