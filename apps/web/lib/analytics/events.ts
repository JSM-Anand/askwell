import "server-only";
import type { Plan } from "@askwell/shared";
import { capture } from "./server";

/**
 * The funnel events (project.md §6.11). Every one is best effort: a PostHog failure is logged and
 * swallowed, so analytics can never change a response. Properties are IDs and enums only: never
 * message text, document text, titles or visitor IDs (project.md §9).
 */
async function track(distinctId: string, event: string, properties?: Record<string, string>): Promise<void> {
  try {
    await capture({ distinctId, event, ...(properties ? { properties } : {}) });
  } catch (cause) {
    console.error(`PostHog event ${event} failed`, cause);
  }
}

export const trackSignedUp = (clerkUserId: string) => track(clerkUserId, "signed_up");

export const trackProjectCreated = (clerkUserId: string, input: { projectId: string; plan: Plan }) =>
  track(clerkUserId, "project_created", { project_id: input.projectId, plan: input.plan });

export const trackKnowledgeAdded = (clerkUserId: string, input: { projectId: string; type: string }) =>
  track(clerkUserId, "knowledge_added", { project_id: input.projectId, type: input.type });

/** Chat events use the project owner's ID: visitors are never identified. */
export const trackFirstChat = (ownerId: string, projectId: string) =>
  track(ownerId, "first_chat", { project_id: projectId });

export type BlockedReason = "rate_limited" | "prompt_injection" | "quota_exceeded";

export const trackMessageBlocked = (ownerId: string, input: { projectId: string; reason: BlockedReason }) =>
  track(ownerId, "message_blocked", { project_id: input.projectId, reason: input.reason });

/** Phase 5's Clerk webhook calls this when a subscription turns Pro. */
export const trackUpgraded = (clerkUserId: string, plan: Plan) => track(clerkUserId, "upgraded", { plan });
