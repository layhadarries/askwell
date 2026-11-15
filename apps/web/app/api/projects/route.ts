import {
  createProjectRequestSchema,
  type CreateProjectResponse,
  type ListProjectsResponse,
  PLAN_LIMITS,
} from '@askwell/shared';
import { NextResponse } from 'next/server';
import { ensureAccount } from '../../../lib/accounts';
import {
  errorResponse,
  generatePublicKey,
  getOwnerPlan,
  internalError,
  isRaised,
  parseJsonBody,
  requireOwnerId,
  toProject,
} from '../../../lib/projects';
import { createOwnerClient } from '../../../lib/supabase/owner';
import { createServiceClient } from '../../../lib/supabase/service';

/** GET /api/projects: the owner's plan and projects. RLS scopes the read. */
export async function GET() {
  const ownerId = await requireOwnerId();
  if (ownerId instanceof NextResponse) return ownerId;

  try {
    const client = createOwnerClient();
    const [plan, { data, error }] = await Promise.all([
      getOwnerPlan(client),
      client.from('projects').select('*').order('created_at', { ascending: true }),
    ]);
    if (error) throw error;

    const body: ListProjectsResponse = { plan, projects: data.map((row) => toProject(row, plan)) };
    return NextResponse.json(body);
  } catch (err) {
    return internalError('GET /api/projects', 'Could not load projects', err);
  }
}

/**
 * POST /api/projects: create a project. The plan is read on the server and its
 * limit is enforced inside `create_project`, under a row lock.
 */
export async function POST(request: Request) {
  const ownerId = await requireOwnerId();
  if (ownerId instanceof NextResponse) return ownerId;

  const input = await parseJsonBody(request, createProjectRequestSchema);
  if (!input) return errorResponse('invalid_input', 'Send a project name (1–80 characters)');

  try {
    await ensureAccount(ownerId);
    const plan = await getOwnerPlan(createOwnerClient());
    const limit = PLAN_LIMITS[plan].projects;

    // Service client: owners can't insert projects. Owner ID is from the session.
    const { data, error } = await createServiceClient().rpc('create_project', {
      p_owner_id: ownerId,
      p_name: input.name,
      p_public_key: generatePublicKey(),
      p_max_projects: limit,
    });
    if (isRaised(error, 'limit_reached')) {
      return errorResponse(
        'limit_reached',
        `Your ${plan === 'pro' ? 'Pro' : 'Free'} plan allows ${limit} project${limit === 1 ? '' : 's'}`,
      );
    }
    if (error || !data) throw error ?? new Error('create_project returned no row');

    const body: CreateProjectResponse = { project: toProject(data, plan) };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return internalError('POST /api/projects', 'Could not create the project', err);
  }
}
