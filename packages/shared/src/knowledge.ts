import { z } from 'zod';

export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_KNOWLEDGE_TITLE_LENGTH = 120;
export const MAX_KNOWLEDGE_TEXT_LENGTH = 200_000;

export const KNOWLEDGE_FILE_TYPES = ['pdf', 'md', 'txt'] as const;
export const knowledgeFileTypeSchema = z.enum(KNOWLEDGE_FILE_TYPES);
export type KnowledgeFileType = z.infer<typeof knowledgeFileTypeSchema>;

export const KNOWLEDGE_TYPES = ['text', ...KNOWLEDGE_FILE_TYPES] as const;
export const knowledgeTypeSchema = z.enum(KNOWLEDGE_TYPES);
export type KnowledgeType = z.infer<typeof knowledgeTypeSchema>;

export const KNOWLEDGE_STATUSES = [
  'uploading',
  'processing',
  'ready',
  'failed',
] as const;
export const knowledgeStatusSchema = z.enum(KNOWLEDGE_STATUSES);
export type KnowledgeStatus = z.infer<typeof knowledgeStatusSchema>;

/** Returns the file type for a file name, or null when unsupported. */
export function knowledgeFileTypeFromName(name: string): KnowledgeFileType | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const normalized = ext === 'markdown' ? 'md' : ext;
  const parsed = knowledgeFileTypeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

const titleSchema = z.string().trim().min(1).max(MAX_KNOWLEDGE_TITLE_LENGTH);

export const knowledgeSourceSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: knowledgeTypeSchema,
  status: knowledgeStatusSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

// POST /api/projects/:id/knowledge (paste text)
export const pasteKnowledgeRequestSchema = z.object({
  title: titleSchema,
  text: z.string().trim().min(1).max(MAX_KNOWLEDGE_TEXT_LENGTH),
});
export type PasteKnowledgeRequest = z.infer<typeof pasteKnowledgeRequestSchema>;
export const pasteKnowledgeResponseSchema = z.object({ source: knowledgeSourceSchema });
export type PasteKnowledgeResponse = z.infer<typeof pasteKnowledgeResponseSchema>;

// POST /api/projects/:id/knowledge/upload-url
export const uploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive().max(MAX_KNOWLEDGE_FILE_BYTES),
  title: titleSchema.optional(),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
export const uploadUrlResponseSchema = z.object({
  source: knowledgeSourceSchema,
  uploadUrl: z.url(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

// POST /api/projects/:id/knowledge/finalize
export const finalizeKnowledgeRequestSchema = z.object({ sourceId: z.uuid() });
export type FinalizeKnowledgeRequest = z.infer<typeof finalizeKnowledgeRequestSchema>;
export const finalizeKnowledgeResponseSchema = z.object({ source: knowledgeSourceSchema });
export type FinalizeKnowledgeResponse = z.infer<typeof finalizeKnowledgeResponseSchema>;

// DELETE /api/knowledge/:id
export const knowledgeIdParamSchema = z.object({ id: z.uuid() });
export type KnowledgeIdParam = z.infer<typeof knowledgeIdParamSchema>;
export const deleteKnowledgeResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteKnowledgeResponse = z.infer<typeof deleteKnowledgeResponseSchema>;
