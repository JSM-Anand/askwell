import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ERROR_STATUS, widgetConfigQuerySchema } from "@askwell/shared";
import type { ApiError, ErrorCode, WidgetConfigResponse } from "@askwell/shared";
import { getPublicConfig } from "../../../../lib/widget-config/get-public-config";

// Public route: any origin may call it. A config change must show on reload, so nothing is cached.
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

function error(code: ErrorCode, message: string) {
  return NextResponse.json<ApiError>(
    { error: { code, message } },
    { status: ERROR_STATUS[code], headers: HEADERS },
  );
}

export async function GET(request: NextRequest) {
  const query = widgetConfigQuerySchema.safeParse({ key: request.nextUrl.searchParams.get("key") });
  if (!query.success) {
    return error("invalid_input", "A project key is required.");
  }

  try {
    const config = await getPublicConfig(query.data.key);
    if (!config) {
      return error("not_found", "No project has that key.");
    }
    return NextResponse.json<WidgetConfigResponse>(config, { headers: HEADERS });
  } catch (cause) {
    console.error("GET /api/widget/config failed", cause);
    return error("internal_error", "Something went wrong.");
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
