import type { NextResponse } from "next/server";
import { idParamSchema, updateConfigSchema } from "@askwell/shared";
import type { UpdateConfigResponse } from "@askwell/shared";
import { getAccount } from "../../../../../lib/accounts/get-account";
import { apiError, getUserId, json, readJson, unauthorized } from "../../../../../lib/projects/api";
import { getOwnedProject } from "../../../../../lib/projects/get-owned-project";
import { canCustomize, customizeLimits, disallowedFields, saveWidgetConfig } from "../../../../../lib/widget-config/update-config";

type Context = { params: Promise<{ id: string }> };

/** PATCH /api/projects/:id/config: save widget settings. Pro only; Free is refused with 402 before anything is written. */
export async function PATCH(request: Request, { params }: Context): Promise<NextResponse> {
  if (!(await getUserId())) return unauthorized();

  const id = idParamSchema.safeParse(await params);
  if (!id.success) return apiError("invalid_input", "The project ID is not valid.");
  const input = updateConfigSchema.safeParse(await readJson(request));
  if (!input.success) return apiError("invalid_input", "Send at least one valid widget setting.");

  try {
    // Ownership first (RLS decides): another owner's project, and a missing one, are both a 404.
    if (!(await getOwnedProject(id.data.id))) return apiError("not_found", "No project with that ID.");

    // The plan comes from the database, never from the request (a `plan` in the body is ignored).
    const account = await getAccount();
    if (!account) throw new Error("No account row for an owner who owns a project");
    const allowed = customizeLimits(account.plan);

    // 402 before anything is read or written: the plan can't customize at all.
    if (!canCustomize(allowed)) {
      return apiError("plan_required", "Customizing the widget is a Pro feature. Upgrade to save your changes.");
    }
    // A plan that can customize may still not allow every value.
    const blocked = disallowedFields(input.data, allowed);
    if (blocked.length > 0) {
      return apiError("plan_required", `Your plan can't change: ${blocked.join(", ")}.`);
    }

    // Only now the service client: ownership and plan are checked.
    const config = await saveWidgetConfig(id.data.id, input.data, account.plan);
    return json<UpdateConfigResponse>({ config });
  } catch (cause) {
    console.error("PATCH /api/projects/:id/config failed", cause);
    return apiError("internal_error", "Something went wrong.");
  }
}
