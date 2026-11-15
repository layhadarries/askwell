import { DEFAULT_WIDGET_CONFIG, publicKeySchema, type WidgetConfig } from '@askwell/shared';

/**
 * The panel's config for a public key, or null for a bad key.
 *
 * Phase 2 mock: returns the default config for any well-formed key. Swap the
 * body for the real lookup once GET /api/widget/config (P2P-T03) is merged.
 */
export async function getEmbedConfig(key: unknown): Promise<WidgetConfig | null> {
  if (!publicKeySchema.safeParse(key).success) return null;
  return { ...DEFAULT_WIDGET_CONFIG };
}
