import { NextResponse } from "next/server";
import { readPostHogConfig } from "../../../lib/analytics/config";

export const dynamic = "force-dynamic";

export function GET() {
  const config = readPostHogConfig();
  return NextResponse.json(
    { key: config?.key ?? null, host: config?.host ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
