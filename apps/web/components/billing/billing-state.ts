import { PLAN_LIMITS, type Plan } from "@askwell/shared";

/** How often, and how many times, the page re-reads the plan after checkout. */
export const POLL_INTERVAL_MS = 3000;
export const MAX_POLLS = 8;

/** The checkout redirect adds this query, so the page knows to wait for the webhook. */
export const CHECKOUT_DONE_PARAM = "checkout";
export const CHECKOUT_DONE_VALUE = "done";
export const CHECKOUT_REDIRECT_URL = `/dashboard/billing?${CHECKOUT_DONE_PARAM}=${CHECKOUT_DONE_VALUE}`;

export type UpgradeStatus = "none" | "waiting" | "stalled" | "done";

/**
 * Where the post-checkout wait stands. Our database is the source of truth: the
 * upgrade is done only when it says pro, never because checkout finished.
 */
export function upgradeStatus(input: { plan: Plan; checkedOut: boolean; polls: number }): UpgradeStatus {
  if (!input.checkedOut) return "none";
  if (input.plan === "pro") return "done";
  return input.polls >= MAX_POLLS ? "stalled" : "waiting";
}

const nf = new Intl.NumberFormat("en-US");

/** The plan's limits as short lines for the plan card, read from `PLAN_LIMITS`. */
export function planFacts(plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  const c = limits.customize;
  return [
    `${nf.format(limits.projects)} ${limits.projects === 1 ? "project" : "projects"}`,
    `${nf.format(limits.messagesPerMonth)} messages a month per project`,
    `${nf.format(limits.knowledgeSources)} knowledge sources per project`,
    c.buttonColor && c.label && c.headerText
      ? "Custom button color, label and header"
      : "Default button color, label and header",
    c.positions.length > 1 ? "Any button corner" : "Bottom-right button",
    c.animations.length > 1 ? "Fade, slide or scale animation" : "Fade animation",
    c.hideBadge ? "Hide the “Powered by” badge" : "“Powered by” badge shown",
  ];
}
