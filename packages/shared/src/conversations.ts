import { z } from 'zod';

export const messageRoleSchema = z.enum(['visitor', 'bot']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  role: messageRoleSchema,
  body: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z.object({
  id: z.uuid(),
  firstMessagePreview: z.string(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

// GET /api/projects/:id/conversations (newest first)
export const listConversationsResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
});
export type ListConversationsResponse = z.infer<typeof listConversationsResponseSchema>;

// GET /api/conversations/:id
export const conversationIdParamSchema = z.object({ id: z.uuid() });
export type ConversationIdParam = z.infer<typeof conversationIdParamSchema>;
export const conversationDetailResponseSchema = z.object({
  conversation: z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    messages: z.array(messageSchema),
  }),
});
export type ConversationDetailResponse = z.infer<typeof conversationDetailResponseSchema>;
