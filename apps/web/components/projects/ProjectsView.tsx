"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { GlassPanel } from "../ui/GlassPanel";
import { Spinner } from "../ui/Spinner";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectsList } from "./ProjectsList";
import { createProject, deleteProject, listProjects, renameProject } from "./projects-client";
import { initialState, limitInfo, projectsReducer } from "./projects-state";

/** The Projects section: loads the owner's projects and lets them create, rename and delete. The server decides every limit. */
export function ProjectsView() {
  const [state, dispatch] = useReducer(projectsReducer, initialState);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const result = await listProjects();
    if (result.ok) dispatch({ type: "loaded", projects: result.data.projects, plan: result.data.plan });
    else dispatch({ type: "loadFailed" });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(name: string): Promise<boolean> {
    setCreating(true);
    const result = await createProject(name);
    setCreating(false);
    if (result.ok) {
      dispatch({ type: "created", project: result.data.project });
      return true;
    }
    if (result.code === "limit_reached") dispatch({ type: "limitReached" });
    else dispatch({ type: "failed", message: result.message });
    return false;
  }

  async function rename(id: string, name: string) {
    setBusyId(id);
    const result = await renameProject(id, name);
    setBusyId(null);
    if (result.ok) dispatch({ type: "renamed", project: result.data.project });
    else dispatch({ type: "failed", message: result.message });
  }

  async function remove(id: string) {
    setBusyId(id);
    const result = await deleteProject(id);
    setBusyId(null);
    // 404 means it is already gone (deleted elsewhere): show it as deleted.
    if (result.ok || result.code === "not_found") dispatch({ type: "deleted", id });
    else dispatch({ type: "failed", message: result.message });
  }

  const limit = limitInfo(state);

  return (
    <section aria-labelledby="projects-title" className="flex flex-col gap-4">
      <h1 id="projects-title" className="text-2xl font-semibold">
        Projects
      </h1>

      <GlassPanel className="flex flex-col gap-4 p-4 sm:p-6">
        {state.status === "loading" ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Spinner label="Loading projects" />
          </div>
        ) : state.status === "error" ? (
          <ErrorState
            message="We couldn't load your projects. Try again in a moment."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  dispatch({ type: "retry" });
                  void load();
                }}
              >
                Try again
              </Button>
            }
          />
        ) : (
          <>
            <CreateProjectForm limit={limit} busy={creating} onCreate={create} />
            {state.notice ? (
              <ErrorState
                title="That didn't work"
                message={state.notice}
                action={
                  <Button variant="secondary" onClick={() => dispatch({ type: "dismissNotice" })}>
                    Dismiss
                  </Button>
                }
              />
            ) : null}
            <ProjectsList
              projects={state.projects}
              editingId={state.editingId}
              confirmingId={state.confirmingId}
              busyId={busyId}
              handlers={{
                onStartEdit: (id) => dispatch({ type: "startEdit", id }),
                onCancelEdit: () => dispatch({ type: "cancelEdit" }),
                onRename: (id, name) => void rename(id, name),
                onAskDelete: (id) => dispatch({ type: "askDelete", id }),
                onCancelDelete: () => dispatch({ type: "cancelDelete" }),
                onConfirmDelete: (id) => void remove(id),
              }}
            />
          </>
        )}
      </GlassPanel>
    </section>
  );
}
