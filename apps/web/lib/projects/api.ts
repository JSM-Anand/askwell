import "server-only";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ERROR_STATUS } from "@askwell/shared";
import type { ApiError, ErrorCode } from "@askwell/shared";

// Owner routes: no CORS headers (only the widget routes are cross-origin) and nothing is cached.
const HEADERS = { "Cache-Control": "private, no-store" };

export function json<T>(body: T, status = 200) {
  return NextResponse.json<T>(body, { status, headers: HEADERS });
}

export function apiError(code: ErrorCode, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status: ERROR_STATUS[code], headers: HEADERS });
}

/**
 * The signed-in Clerk user ID, from the verified session. The proxy already
 * answers 401 on these routes; this is the second check, so the handlers never
 * run without a user and never take an owner from the request.
 */
export async function getUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

export const unauthorized = () => apiError("unauthorized", "Sign in to use this endpoint.");

/** Parses a JSON body, or returns undefined when it isn't valid JSON. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
