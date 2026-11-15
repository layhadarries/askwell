import {
  type DeleteProjectResponse,
  projectIdParamSchema,
  updateProjectRequestSchema,
  type UpdateProjectResponse,
} from '@askwell/shared';
import { NextResponse } from 'next/server';
import {
  errorResponse,
  getOwnerPlan,
  parseJsonBody,
  requireOwnerId,
  toProject,
} from '../../../../lib/projects';
import { createOwnerClient } from '../../../../lib/supabase/owner';

type Context = { params: Promise<{ id: string }> };

const NOT_FOUND = 'Project not found';

/**
 * PATCH /api/projects/:id: rename. Owner client only: RLS limits it to the
 * owner's rows and the column grant to `name`. No row updated means 404, so
 * another owner's project looks the same as a missing one.
 */
export async function PATCH(request: Request, { params }: Context) {
  const ownerId = await requireOwnerId();
  if (ownerId instanceof NextResponse) return ownerId;

  const id = projectIdParamSchema.safeParse(await params);
  if (!id.success) return errorResponse('invalid_input', 'Invalid project ID');
  const input = await parseJsonBody(request, updateProjectRequestSchema);
  if (!input) return errorResponse('invalid_input', 'Send a project name (1–80 characters)');

  const client = createOwnerClient();
  const { data, error } = await client
    .from('projects')
    .update({ name: input.name })
    .eq('id', id.data.id)
    .select('*')
    .maybeSingle();
  if (error) return errorResponse('internal_error', 'Could not rename the project');
  if (!data) return errorResponse('not_found', NOT_FOUND);

  const body: UpdateProjectResponse = { project: toProject(data, await getOwnerPlan(client)) };
  return NextResponse.json(body);
}

/** DELETE /api/projects/:id: owner client, RLS allows owner deletes only. 0 rows → 404. */
export async function DELETE(_request: Request, { params }: Context) {
  const ownerId = await requireOwnerId();
  if (ownerId instanceof NextResponse) return ownerId;

  const id = projectIdParamSchema.safeParse(await params);
  if (!id.success) return errorResponse('invalid_input', 'Invalid project ID');

  const { data, error } = await createOwnerClient()
    .from('projects')
    .delete()
    .eq('id', id.data.id)
    .select('id');
  if (error) return errorResponse('internal_error', 'Could not delete the project');
  if (data.length === 0) return errorResponse('not_found', NOT_FOUND);

  const body: DeleteProjectResponse = { ok: true };
  return NextResponse.json(body);
}
