import { NextResponse } from "next/server";
import { PLAN_LIMITS, createProjectSchema } from "@askwell/shared";
import type { CreateProjectResponse, ListProjectsResponse } from "@askwell/shared";
import { trackProjectCreated } from "../../../lib/analytics/events";
import { ensureAccount } from "../../../lib/accounts/ensure-account";
import { getAccount } from "../../../lib/accounts/get-account";
import { apiError, getUserId, json, readJson, unauthorized } from "../../../lib/projects/api";
import { generatePublicKey } from "../../../lib/projects/public-key";
import { PROJECT_COLUMNS, toProjectSummary } from "../../../lib/projects/to-summary";
import { createOwnerClient } from "../../../lib/supabase/owner";
import { createServiceClient } from "../../../lib/supabase/service";

// Error codes of create_project (supabase/migrations/*_create_project.sql).
const PROJECT_LIMIT_REACHED = "AW001";
const UNIQUE_VIOLATION = "23505";
const KEY_ATTEMPTS = 3;

export async function GET(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    // RLS scopes both reads to the signed-in owner.
    const account = await getAccount();
    const { data, error } = await createOwnerClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // No account row yet means a brand-new owner: Free, and nothing to list.
    return json<ListProjectsResponse>({
      projects: (data ?? []).map(toProjectSummary),
      plan: account?.plan ?? "free",
    });
  } catch (cause) {
    console.error("GET /api/projects failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const input = createProjectSchema.safeParse(await readJson(request));
  if (!input.success) {
    return apiError("invalid_input", "Send a project name of 1 to 100 characters.");
  }

  try {
    // The plan comes from the database, never from the request.
    await ensureAccount(userId);
    const account = await getAccount();
    if (!account) throw new Error("No account row after ensureAccount");
    const limit = PLAN_LIMITS[account.plan].projects;

    for (let attempt = 1; attempt <= KEY_ATTEMPTS; attempt++) {
      const { data, error } = await createServiceClient().rpc("create_project", {
        p_owner_id: userId,
        p_name: input.data.name,
        p_public_key: generatePublicKey(),
        p_max_projects: limit,
      });

      if (!error) {
        await trackProjectCreated(userId, { projectId: data.id, plan: account.plan });
        return json<CreateProjectResponse>({ project: toProjectSummary(data) }, 201);
      }
      if (error.code === PROJECT_LIMIT_REACHED) {
        return apiError(
          "limit_reached",
          `Your ${account.plan === "free" ? "Free" : "Pro"} plan allows ${limit} project${limit === 1 ? "" : "s"}.`,
        );
      }
      // A key collision is a one-in-2^192 event; try a fresh key rather than fail.
      if (error.code !== UNIQUE_VIOLATION || attempt === KEY_ATTEMPTS) {
        throw new Error(`create_project failed: ${error.code} ${error.message}`);
      }
    }
    throw new Error("unreachable");
  } catch (cause) {
    console.error("POST /api/projects failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
