import {
  apiError,
  applyPlanToConfig,
  DEFAULT_WIDGET_CONFIG,
  ERROR_STATUS,
  type ErrorCode,
  type Plan,
  type WidgetConfig,
  widgetConfigQuerySchema,
  type WidgetConfigResponse,
  widgetConfigResponseSchema,
  widgetConfigSchema,
} from '@askwell/shared';
import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service';

/**
 * Public: called by the loader on the customer's site and by the /embed panel.
 * Any origin may read it, without credentials (§9 CORS). The public key only
 * identifies a project; the response holds widget fields only.
 *
 * TODO(Phase 3): rate limit this route with Arcjet (project.md §9, Cost abuse).
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

/** Short public cache: a saved config shows up within a minute. */
const CACHE_OK = 'public, max-age=60';

function errorResponse(code: ErrorCode, message: string) {
  return NextResponse.json(apiError(code, message), {
    status: ERROR_STATUS[code],
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  });
}

const NOT_FOUND = 'Unknown widget key';

type ConfigRow = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

/** Stored row → WidgetConfig. A missing or invalid row falls back to the defaults. */
function toWidgetConfig(row: ConfigRow | null): WidgetConfig {
  if (!row) return { ...DEFAULT_WIDGET_CONFIG };
  const parsed = widgetConfigSchema.safeParse({
    buttonColor: row.button_color,
    position: row.position,
    label: row.label,
    animation: row.animation,
    headerText: row.header_text,
    showBadge: row.show_badge,
  });
  return parsed.success ? parsed.data : { ...DEFAULT_WIDGET_CONFIG };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const query = widgetConfigQuerySchema.safeParse({
    key: new URL(request.url).searchParams.get('key') ?? undefined,
  });
  if (!query.success) return errorResponse('not_found', NOT_FOUND);

  try {
    // Service client: visitors have no Supabase key. Looked up by public_key only.
    const { data, error } = await createServiceClient()
      .from('projects')
      .select(
        'accounts(plan), widget_configs(button_color, position, label, animation, header_text, show_badge)',
      )
      .eq('public_key', query.data.key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return errorResponse('not_found', NOT_FOUND);

    // Plan read on the server from the owner's account; anything but `pro` is Free.
    const plan: Plan = data.accounts?.plan === 'pro' ? 'pro' : 'free';
    const config = applyPlanToConfig(plan, toWidgetConfig(data.widget_configs));

    // Parse strips anything that isn't a widget field.
    const body: WidgetConfigResponse = widgetConfigResponseSchema.parse(config);
    return NextResponse.json(body, {
      headers: { ...CORS_HEADERS, 'Cache-Control': CACHE_OK },
    });
  } catch (err) {
    console.error('GET /api/widget/config failed', err);
    return errorResponse('internal_error', 'Could not load the widget config');
  }
}
