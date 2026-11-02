import { PLAN_LIMITS } from "@askwell/shared";
import type { Plan, ProjectSummary } from "@askwell/shared";

export type ProjectsState = {
  status: "loading" | "error" | "ready";
  projects: ProjectSummary[];
  plan: Plan;
  /** The server answered 402: the UI only reflects it, the server decides. */
  serverLimit: boolean;
  editingId: string | null;
  /** The project whose delete is waiting for a confirm. */
  confirmingId: string | null;
  notice: string | null;
};

export type ProjectsAction =
  | { type: "loaded"; projects: ProjectSummary[]; plan: Plan }
  | { type: "loadFailed" }
  | { type: "retry" }
  | { type: "created"; project: ProjectSummary }
  | { type: "limitReached" }
  | { type: "failed"; message: string }
  | { type: "renamed"; project: ProjectSummary }
  | { type: "deleted"; id: string }
  | { type: "startEdit"; id: string }
  | { type: "cancelEdit" }
  | { type: "askDelete"; id: string }
  | { type: "cancelDelete" }
  | { type: "dismissNotice" };

export const initialState: ProjectsState = {
  status: "loading",
  projects: [],
  plan: "free",
  serverLimit: false,
  editingId: null,
  confirmingId: null,
  notice: null,
};

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case "loaded":
      return { ...state, status: "ready", projects: action.projects, plan: action.plan, notice: null };
    case "loadFailed":
      return { ...state, status: "error" };
    case "retry":
      return { ...state, status: "loading" };
    case "created":
      return { ...state, projects: [action.project, ...state.projects], notice: null };
    case "limitReached":
      return { ...state, serverLimit: true, notice: null };
    case "failed":
      return { ...state, notice: action.message };
    case "renamed":
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.project.id ? action.project : p)),
        editingId: null,
        notice: null,
      };
    case "deleted":
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        confirmingId: null,
        serverLimit: false,
        notice: null,
      };
    case "startEdit":
      return { ...state, editingId: action.id, confirmingId: null, notice: null };
    case "cancelEdit":
      return { ...state, editingId: null };
    case "askDelete":
      // Deleting needs a second click: this only opens the confirm step.
      return { ...state, confirmingId: action.id, editingId: null, notice: null };
    case "cancelDelete":
      return { ...state, confirmingId: null };
    case "dismissNotice":
      return { ...state, notice: null };
  }
}

const plural = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

export type LimitInfo = { atLimit: boolean; message: string | null; canUpgrade: boolean };

/** Whether the owner is at their plan's project limit, and what to tell them. The server enforces it. */
export function limitInfo(state: Pick<ProjectsState, "plan" | "projects" | "serverLimit">): LimitInfo {
  const limit = PLAN_LIMITS[state.plan].projects;
  const atLimit = state.serverLimit || state.projects.length >= limit;
  if (!atLimit) return { atLimit: false, message: null, canUpgrade: false };

  if (state.plan === "free") {
    return {
      atLimit,
      message: `Free allows ${plural(PLAN_LIMITS.free.projects)}. Upgrade to Pro for ${PLAN_LIMITS.pro.projects}.`,
      canUpgrade: true,
    };
  }
  return { atLimit, message: `Pro allows ${plural(PLAN_LIMITS.pro.projects)}.`, canUpgrade: false };
}
