import { WIDGET_ANIMATIONS, type WidgetAnimation, type WidgetPosition } from "./widget";

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanLimits = {
  projects: number;
  messagesPerMonth: number;
  knowledgeSources: number;
  customize: {
    /** Any button color (otherwise the default). */
    buttonColor: boolean;
    /** Positions the plan may pick. */
    positions: readonly WidgetPosition[];
    /** Custom button label (otherwise the default). */
    label: boolean;
    /** Open animations the plan may pick. */
    animations: readonly WidgetAnimation[];
    /** Custom header text (otherwise the default). */
    headerText: boolean;
    /** May hide the "Powered by" badge. */
    hideBadge: boolean;
  };
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customize: {
      buttonColor: false,
      positions: ["bottom-right"],
      label: false,
      animations: ["fade"],
      headerText: false,
      hideBadge: false,
    },
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customize: {
      buttonColor: true,
      positions: ["bottom-right", "bottom-left", "top-right", "top-left"],
      label: true,
      animations: WIDGET_ANIMATIONS,
      headerText: true,
      hideBadge: true,
    },
  },
};
