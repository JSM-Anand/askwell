import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleChat } from "../../../../lib/chat/handle-chat";

// Public route: the widget calls it from any customer site, so any origin may call it. Answers are
// per question and must never be cached.
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = undefined; // not JSON: the schema check answers 400
  }
  const { status, body: payload } = await handleChat(request, body);
  return NextResponse.json(payload, { status, headers: HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
