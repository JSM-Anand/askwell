"use client";

import Link from "next/link";
import { useReducer, useState } from "react";
import type { KnowledgeSourceSummary, Plan } from "@askwell/shared";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { GlassPanel } from "../ui/GlassPanel";
import { PasteForm } from "./PasteForm";
import { SourceList } from "./SourceList";
import { UploadForm } from "./UploadForm";
import { deleteSource, finalizeUpload, pasteText, putFile, requestUpload } from "./knowledge-client";
import { initialKnowledgeState, knowledgeReducer, sourceLimitInfo } from "./knowledge-state";
import { checkFile } from "./validate-file";

export type KnowledgeViewProps = {
  projectId: string;
  plan: Plan;
  initialSources: KnowledgeSourceSummary[];
};

/**
 * The Knowledge section of one project: add pasted text or a file, see each source's status, delete.
 * The server decides every limit and checks every file; this only reflects what it answers.
 */
export function KnowledgeView({ projectId, plan, initialSources }: KnowledgeViewProps) {
  const [state, dispatch] = useReducer(knowledgeReducer, initialKnowledgeState(initialSources, plan));
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const limit = sourceLimitInfo(state);

  async function paste(title: string, content: string): Promise<boolean> {
    setAdding(true);
    const result = await pasteText(projectId, title, content);
    setAdding(false);
    if (result.ok) {
      dispatch({ type: "added", source: result.data.source });
      return true;
    }
    if (result.code === "limit_reached") dispatch({ type: "limitReached" });
    else dispatch({ type: "failed", message: result.message });
    return false;
  }

  async function addFile(file: File) {
    // A quick message in the browser; the server validates the type and size again, and finalize the real file.
    const check = checkFile(file);
    if (!check.ok) {
      dispatch({ type: "failed", message: check.message });
      return;
    }

    setAdding(true);
    try {
      const reserved = await requestUpload(projectId, check.title, check.fileType, file.size);
      if (!reserved.ok) {
        if (reserved.code === "limit_reached") dispatch({ type: "limitReached" });
        else dispatch({ type: "failed", message: reserved.message });
        return;
      }
      const { source, uploadUrl } = reserved.data;
      dispatch({ type: "added", source });
      dispatch({ type: "progress", id: source.id, percent: 0 });

      const uploaded = await putFile(uploadUrl, file, check.fileType, (percent) =>
        dispatch({ type: "progress", id: source.id, percent }),
      );
      dispatch({ type: "progress", id: source.id, percent: null });
      if (!uploaded.ok) {
        dispatch({ type: "failed", message: "The upload didn't finish. Delete the entry below and try again." });
        return;
      }

      const finalized = await finalizeUpload(projectId, source.id);
      if (finalized.ok) {
        dispatch({ type: "updated", source: finalized.data.source });
      } else if (finalized.code === "file_too_large" || finalized.code === "unsupported_file_type") {
        // The server refused the file and removed it and its entry.
        dispatch({ type: "deleted", id: source.id });
        dispatch({ type: "failed", message: finalized.message });
      } else {
        dispatch({ type: "failed", message: finalized.message });
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    const result = await deleteSource(id);
    setBusyId(null);
    // 404 means it is already gone (deleted elsewhere): show it as deleted.
    if (result.ok || result.code === "not_found") dispatch({ type: "deleted", id });
    else dispatch({ type: "failed", message: result.message });
  }

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel className="flex flex-col gap-4 p-4 sm:p-6">
        {limit.message ? (
          <p role="status" className="text-sm text-fg-muted">
            {limit.message}{" "}
            {limit.canUpgrade ? (
              <Link href="/dashboard/billing" className="font-medium text-fg underline underline-offset-2">
                Upgrade
              </Link>
            ) : null}
          </p>
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          <PasteForm disabled={limit.atLimit} busy={adding} onPaste={paste} />
          <UploadForm disabled={limit.atLimit} busy={adding} onFile={(file) => void addFile(file)} />
        </div>
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
      </GlassPanel>

      <GlassPanel className="p-4 sm:p-6">
        <SourceList
          sources={state.sources}
          confirmingId={state.confirmingId}
          progress={state.progress}
          busyId={busyId}
          onAskDelete={(id) => dispatch({ type: "askDelete", id })}
          onCancelDelete={() => dispatch({ type: "cancelDelete" })}
          onConfirmDelete={(id) => void remove(id)}
        />
      </GlassPanel>
    </div>
  );
}
