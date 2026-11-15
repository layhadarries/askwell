import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { ProjectsManager } from '../../components/projects';
import { getOwnerPlan, toProject } from '../../lib/projects';
import { createOwnerClient } from '../../lib/supabase/owner';

export const metadata: Metadata = { title: 'Projects' };

export default async function DashboardPage() {
  await auth.protect();
  // Owner client: RLS limits the read to this owner's projects (§9).
  const client = createOwnerClient();
  const [plan, { data, error }] = await Promise.all([
    getOwnerPlan(client),
    client.from('projects').select('*').order('created_at', { ascending: true }),
  ]);
  // A failed read shows the segment's error.tsx with a retry.
  if (error) throw new Error(`Projects page: could not load projects: ${error.message}`);

  return <ProjectsManager initialProjects={data.map((row) => toProject(row, plan))} />;
}
