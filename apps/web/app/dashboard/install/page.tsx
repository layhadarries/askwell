import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  appOrigin,
  InstallView,
  projectParam,
  resolveInstallState,
} from '../../../components/install';
import { createOwnerClient, getOwnedProject } from '../../../lib/supabase/owner';

export const metadata: Metadata = { title: 'Install' };

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await auth.protect();
  const { project } = await searchParams;
  // Origin from the request, so every preview gives a working tag.
  const origin = appOrigin(await headers(), process.env.NEXT_PUBLIC_APP_URL);

  // Owner client only: RLS hides other owners' projects (§9).
  const client = createOwnerClient();
  const state = await resolveInstallState(projectParam(project), origin, {
    ownedProject: (id) => getOwnedProject(id, client),
    async firstProject() {
      const { data, error } = await client
        .from('projects')
        .select('name, public_key')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Install page: could not load projects: ${error.message}`);
      return data;
    },
  });

  return <InstallView state={state} />;
}
