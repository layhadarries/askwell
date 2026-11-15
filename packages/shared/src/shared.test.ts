import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  DEFAULT_WIDGET_CONFIG,
  ERROR_CODES,
  ERROR_STATUS,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  PLAN_LIMITS,
  apiError,
  apiErrorSchema,
  applyPlanToConfig,
  conversationDetailResponseSchema,
  createProjectRequestSchema,
  disallowedConfigFields,
  finalizeKnowledgeRequestSchema,
  knowledgeFileTypeFromName,
  listConversationsResponseSchema,
  listProjectsResponseSchema,
  pasteKnowledgeRequestSchema,
  updateConfigRequestSchema,
  updateProjectRequestSchema,
  uploadUrlRequestSchema,
  widgetChatRequestSchema,
  widgetConfigQuerySchema,
  widgetConfigSchema,
} from './index';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const now = '2026-01-01T00:00:00Z';

describe('PLAN_LIMITS (§5)', () => {
  it('matches the plan table', () => {
    expect(PLAN_LIMITS.free.projects).toBe(1);
    expect(PLAN_LIMITS.pro.projects).toBe(5);
    expect(PLAN_LIMITS.free.messagesPerMonth).toBe(100);
    expect(PLAN_LIMITS.pro.messagesPerMonth).toBe(2000);
    expect(PLAN_LIMITS.free.knowledgeSources).toBe(3);
    expect(PLAN_LIMITS.pro.knowledgeSources).toBe(25);
    expect(PLAN_LIMITS.free.widget).toEqual({
      customColor: false,
      positions: ['bottom-right'],
      customLabel: false,
      animations: ['fade'],
      customHeaderText: false,
      canHideBadge: false,
    });
    expect(PLAN_LIMITS.pro.widget.positions).toHaveLength(4);
    expect(PLAN_LIMITS.pro.widget.animations).toEqual(['fade', 'slide', 'scale']);
    expect(PLAN_LIMITS.pro.widget.canHideBadge).toBe(true);
  });
  it('keeps constants', () => {
    expect(APP_NAME).toBe('Askwell');
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_MESSAGE_LENGTH).toBe(1000);
  });
});

describe('errors', () => {
  it('builds the standard shape', () => {
    const e = apiError('plan_required', 'Upgrade');
    expect(e).toEqual({ error: { code: 'plan_required', message: 'Upgrade' } });
    expect(apiErrorSchema.parse(e)).toEqual(e);
    expect(apiErrorSchema.safeParse({ error: { code: 'nope', message: 'x' } }).success).toBe(false);
  });
  it('has a status for every code, 402 for plan_required', () => {
    for (const c of ERROR_CODES) expect(ERROR_STATUS[c]).toBeGreaterThanOrEqual(400);
    expect(ERROR_STATUS.plan_required).toBe(402);
    expect(ERROR_STATUS.not_found).toBe(404);
  });
});

describe('widget schemas', () => {
  it('config query needs a pk_ key', () => {
    expect(widgetConfigQuerySchema.safeParse({ key: 'pk_abc' }).success).toBe(true);
    expect(widgetConfigQuerySchema.safeParse({ key: 'abc' }).success).toBe(false);
  });
  it('default config is valid', () => {
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(true);
  });
  it('chat request limits message length', () => {
    const base = { key: 'pk_a', visitorId: 'v1', message: 'hi' };
    expect(widgetChatRequestSchema.safeParse(base).success).toBe(true);
    expect(widgetChatRequestSchema.safeParse({ ...base, conversationId: uuid }).success).toBe(true);
    expect(widgetChatRequestSchema.safeParse({ ...base, message: 'a'.repeat(MAX_MESSAGE_LENGTH) }).success).toBe(true);
    expect(widgetChatRequestSchema.safeParse({ ...base, message: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) }).success).toBe(false);
    expect(widgetChatRequestSchema.safeParse({ ...base, message: '   ' }).success).toBe(false);
  });
  it('gates config fields by plan', () => {
    expect(disallowedConfigFields('free', { buttonColor: '#000000', showBadge: false })).toEqual(['buttonColor', 'showBadge']);
    expect(disallowedConfigFields('free', { position: 'bottom-right', animation: 'fade' })).toEqual([]);
    expect(disallowedConfigFields('free', { position: 'top-left', animation: 'scale', label: 'x', headerText: 'y' })).toEqual(['position', 'label', 'animation', 'headerText']);
    expect(disallowedConfigFields('pro', { buttonColor: '#000000', position: 'top-left', showBadge: false })).toEqual([]);
  });
  it('applies plan to the public config', () => {
    const custom = { ...DEFAULT_WIDGET_CONFIG, buttonColor: '#000000', showBadge: false };
    expect(applyPlanToConfig('free', custom)).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(applyPlanToConfig('pro', custom)).toEqual(custom);
  });
});

describe('project schemas', () => {
  const project = { id: uuid, name: 'P', publicKey: 'pk_x', messagesUsed: 1, messageLimit: 100, periodStart: now, createdAt: now };
  it('validates create/rename input', () => {
    expect(createProjectRequestSchema.safeParse({ name: ' Docs ' }).data).toEqual({ name: 'Docs' });
    expect(createProjectRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expect(updateProjectRequestSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
  });
  it('validates list output', () => {
    expect(listProjectsResponseSchema.safeParse({ plan: 'free', projects: [project] }).success).toBe(true);
    expect(listProjectsResponseSchema.safeParse({ plan: 'gold', projects: [] }).success).toBe(false);
  });
  it('PATCH config needs at least one valid field', () => {
    expect(updateConfigRequestSchema.safeParse({}).success).toBe(false);
    expect(updateConfigRequestSchema.safeParse({ buttonColor: 'red' }).success).toBe(false);
    expect(updateConfigRequestSchema.safeParse({ buttonColor: '#aabbcc' }).success).toBe(true);
  });
});

describe('knowledge schemas', () => {
  it('maps file names to types', () => {
    expect(knowledgeFileTypeFromName('a.PDF')).toBe('pdf');
    expect(knowledgeFileTypeFromName('a.md')).toBe('md');
    expect(knowledgeFileTypeFromName('a.markdown')).toBe('md');
    expect(knowledgeFileTypeFromName('a.txt')).toBe('txt');
    expect(knowledgeFileTypeFromName('a.exe')).toBeNull();
    expect(knowledgeFileTypeFromName('noext')).toBeNull();
  });
  it('paste needs title and text', () => {
    expect(pasteKnowledgeRequestSchema.safeParse({ title: 'T', text: 'body' }).success).toBe(true);
    expect(pasteKnowledgeRequestSchema.safeParse({ title: '', text: 'body' }).success).toBe(false);
  });
  it('upload-url enforces the size cap', () => {
    expect(uploadUrlRequestSchema.safeParse({ fileName: 'a.pdf', sizeBytes: MAX_KNOWLEDGE_FILE_BYTES }).success).toBe(true);
    expect(uploadUrlRequestSchema.safeParse({ fileName: 'a.pdf', sizeBytes: MAX_KNOWLEDGE_FILE_BYTES + 1 }).success).toBe(false);
    expect(uploadUrlRequestSchema.safeParse({ fileName: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
  });
  it('finalize needs a source id', () => {
    expect(finalizeKnowledgeRequestSchema.safeParse({ sourceId: uuid }).success).toBe(true);
    expect(finalizeKnowledgeRequestSchema.safeParse({ sourceId: 'x' }).success).toBe(false);
  });
});

describe('conversation schemas', () => {
  const msg = { id: uuid, role: 'bot', body: 'x', createdAt: now };
  const detail = (m: unknown) => ({ conversation: { id: uuid, projectId: uuid, createdAt: now, messages: [m] } });
  it('validates list and detail output', () => {
    expect(listConversationsResponseSchema.safeParse({ conversations: [{ id: uuid, firstMessagePreview: 'hi', messageCount: 2, createdAt: now }] }).success).toBe(true);
    expect(conversationDetailResponseSchema.safeParse(detail(msg)).success).toBe(true);
    expect(conversationDetailResponseSchema.safeParse(detail({ ...msg, role: 'admin' })).success).toBe(false);
  });
});
