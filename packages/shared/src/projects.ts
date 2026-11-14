import { z } from 'zod';
import { planSchema } from './plans';
import { PUBLIC_KEY_PREFIX, widgetConfigSchema } from './widget';

export const MAX_PROJECT_NAME_LENGTH = 80;

export const projectIdParamSchema = z.object({ id: z.uuid() });
export type ProjectIdParam = z.infer<typeof projectIdParamSchema>;

const projectNameSchema = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH);

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  publicKey: z.string().startsWith(PUBLIC_KEY_PREFIX),
  messagesUsed: z.number().int().nonnegative(),
  messageLimit: z.number().int().nonnegative(),
  periodStart: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Project = z.infer<typeof projectSchema>;

// GET /api/projects
export const listProjectsResponseSchema = z.object({
  plan: planSchema,
  projects: z.array(projectSchema),
});
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;

// POST /api/projects
export const createProjectRequestSchema = z.object({ name: projectNameSchema });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export const createProjectResponseSchema = z.object({ project: projectSchema });
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;

// PATCH /api/projects/:id (rename)
export const updateProjectRequestSchema = z.object({ name: projectNameSchema });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export const updateProjectResponseSchema = z.object({ project: projectSchema });
export type UpdateProjectResponse = z.infer<typeof updateProjectResponseSchema>;

// DELETE /api/projects/:id
export const deleteProjectResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteProjectResponse = z.infer<typeof deleteProjectResponseSchema>;

// PATCH /api/projects/:id/config (402 if Free)
export const updateConfigRequestSchema = widgetConfigSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');
export type UpdateConfigRequest = z.infer<typeof updateConfigRequestSchema>;
export const updateConfigResponseSchema = z.object({ config: widgetConfigSchema });
export type UpdateConfigResponse = z.infer<typeof updateConfigResponseSchema>;
