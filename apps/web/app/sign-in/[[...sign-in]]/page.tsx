import { SignIn } from '@clerk/nextjs';
import { Suspense } from 'react';

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Suspense>
        <SignIn />
      </Suspense>
    </main>
  );
}
