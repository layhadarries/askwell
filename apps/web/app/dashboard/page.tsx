import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';

// Placeholder until P1F-T09 (Dashboard shell) replaces it.
export default async function DashboardPage() {
  await auth.protect();
  return (
    <main className="flex min-h-dvh items-center justify-center gap-3 p-4">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <UserButton />
    </main>
  );
}
