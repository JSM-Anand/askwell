import { PLAN_LIMITS } from "@askwell/shared";
import type { KnowledgeSourceStatus, KnowledgeSourceSummary, Plan } from "@askwell/shared";

export type KnowledgeState = {
  sources: KnowledgeSourceSummary[];
  plan: Plan;
  /** The server answered 402: the UI only reflects it, the server decides. */
  serverLimit: boolean;
  /** The source whose delete is waiting for a confirm. */
  confirmingId: string | null;
  /** Upload progress by source ID, 0 to 100, while a file is going to Storage. */
  progress: Record<string, number>;
  notice: string | null;
};

export type KnowledgeAction =
  | { type: "added"; source: KnowledgeSourceSummary }
  | { type: "updated"; source: KnowledgeSourceSummary }
  | { type: "progress"; id: string; percent: number | null }
  | { type: "limitReached" }
  | { type: "failed"; message: string }
  | { type: "deleted"; id: string }
  | { type: "askDelete"; id: string }
  | { type: "cancelDelete" }
  | { type: "dismissNotice" };

export const initialKnowledgeState = (sources: KnowledgeSourceSummary[], plan: Plan): KnowledgeState => ({
  sources,
  plan,
  serverLimit: false,
  confirmingId: null,
  progress: {},
  notice: null,
});

const without = (record: Record<string, number>, key: string): Record<string, number> =>
  Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));

export function knowledgeReducer(state: KnowledgeState, action: KnowledgeAction): KnowledgeState {
  switch (action.type) {
    case "added":
      return { ...state, sources: [action.source, ...state.sources], notice: null };
    case "updated":
      return { ...state, sources: state.sources.map((s) => (s.id === action.source.id ? action.source : s)) };
    case "progress": {
      const rest = without(state.progress, action.id);
      return { ...state, progress: action.percent === null ? rest : { ...rest, [action.id]: action.percent } };
    }
    case "limitReached":
      return { ...state, serverLimit: true, notice: null };
    case "failed":
      return { ...state, notice: action.message };
    case "deleted":
      return {
        ...state,
        sources: state.sources.filter((s) => s.id !== action.id),
        confirmingId: state.confirmingId === action.id ? null : state.confirmingId,
        progress: without(state.progress, action.id),
        serverLimit: false,
      };
    case "askDelete":
      // Deleting needs a second click: this only opens the confirm step.
      return { ...state, confirmingId: action.id, notice: null };
    case "cancelDelete":
      return { ...state, confirmingId: null };
    case "dismissNotice":
      return { ...state, notice: null };
  }
}

/** `uploading` and `processing` are the same thing to the owner: the source isn't ready yet. */
export function statusLabel(status: KnowledgeSourceStatus): string {
  return status === "ready" ? "Ready" : status === "failed" ? "Failed" : "Processing";
}

const plural = (n: number) => `${n} source${n === 1 ? "" : "s"}`;

export type SourceLimitInfo = { atLimit: boolean; message: string | null; canUpgrade: boolean };

/** Whether the project is at its plan's source limit, and what to tell the owner. The server enforces it. */
export function sourceLimitInfo(state: Pick<KnowledgeState, "plan" | "sources" | "serverLimit">): SourceLimitInfo {
  const limit = PLAN_LIMITS[state.plan].knowledgeSources;
  const atLimit = state.serverLimit || state.sources.length >= limit;
  if (!atLimit) return { atLimit: false, message: null, canUpgrade: false };

  if (state.plan === "free") {
    return {
      atLimit,
      message: `Free allows ${plural(PLAN_LIMITS.free.knowledgeSources)} per project. Upgrade to Pro for ${PLAN_LIMITS.pro.knowledgeSources}.`,
      canUpgrade: true,
    };
  }
  return { atLimit, message: `Pro allows ${plural(PLAN_LIMITS.pro.knowledgeSources)} per project.`, canUpgrade: false };
}
