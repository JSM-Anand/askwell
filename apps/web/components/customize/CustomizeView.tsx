"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Plan, WidgetConfig } from "@askwell/shared";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { GlassPanel } from "../ui/GlassPanel";
import { CustomizeForm } from "./CustomizeForm";
import { WidgetPreview } from "./WidgetPreview";
import { saveConfig } from "./customize-client";
import { changedFields, planCanCustomize, previewConfig, validateConfig } from "./customize-state";
import type { FieldErrors, FieldName } from "./customize-state";

export type CustomizeViewProps = {
  projectId: string;
  /** The owner's plan from the server. It only decides what is shown; the server enforces it on save. */
  plan: Plan;
  /** The config as visitors see it now (plan-applied). */
  initialConfig: WidgetConfig;
};

const TOAST_MS = 5000;
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * The Customize section of one project: the form, a live preview that follows it, and Save. Free sees the form
 * locked with an upgrade prompt; a 402 from the server locks it the same way.
 */
export function CustomizeView({ projectId, plan, initialConfig }: CustomizeViewProps) {
  const [saved, setSaved] = useState(initialConfig);
  const [draft, setDraft] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [refused, setRefused] = useState(false); // the server answered 402
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [replay, setReplay] = useState(0);

  const locked = !planCanCustomize(plan) || refused;
  const changed = changedFields(saved, draft);
  const hasChanges = Object.keys(changed).length > 0;

  // An error shows once the owner has touched that field, or tried to save.
  const allErrors = validateConfig(draft);
  const errors: FieldErrors = {};
  for (const name of Object.keys(allErrors) as FieldName[]) {
    if (attempted || draft[name] !== saved[name]) errors[name] = allErrors[name];
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function save() {
    setAttempted(true);
    setNotice(null);
    if (Object.keys(allErrors).length > 0 || !hasChanges) return;

    setSaving(true);
    const result = await saveConfig(projectId, changed); // only the fields that changed
    setSaving(false);

    if (result.ok) {
      setSaved(result.config);
      setDraft(result.config);
      setAttempted(false);
      setToast(true);
    } else if (result.code === "plan_required") {
      setRefused(true);
    } else if (result.code === "invalid_input") {
      setNotice("Some settings aren't valid. Check the fields and try again.");
    } else {
      setNotice(result.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {locked ? (
        <GlassPanel role="status" className="p-4 sm:p-4">
          <p className="text-sm">
            Customize is a Pro feature.{" "}
            <Link href="/dashboard/billing" className="font-medium underline underline-offset-2">
              Upgrade to Pro
            </Link>{" "}
            to change how your widget looks.
          </p>
        </GlassPanel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <GlassPanel className="flex flex-col gap-3 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Preview</h2>
              <Button variant="ghost" onClick={() => setReplay((n) => n + 1)}>
                Replay animation
              </Button>
            </div>
            <WidgetPreview config={previewConfig(saved, draft)} replayKey={replay} />
            {locked ? <p className="text-xs text-fg-muted">This is how your widget looks to visitors now.</p> : null}
          </GlassPanel>
        </div>

        <GlassPanel className="min-w-0 p-4 sm:p-6 lg:order-1">
          <CustomizeForm
            draft={draft}
            pickerColor={HEX.test(draft.buttonColor) ? draft.buttonColor : saved.buttonColor}
            errors={errors}
            disabled={locked}
            saving={saving}
            canSave={hasChanges}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onSubmit={() => void save()}
          />
          {notice ? (
            <ErrorState
              className="mt-4"
              title="That didn't save"
              message={notice}
              action={
                <Button variant="secondary" onClick={() => setNotice(null)}>
                  Dismiss
                </Button>
              }
            />
          ) : null}
        </GlassPanel>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3 text-sm shadow-glass sm:left-auto sm:max-w-sm"
        >
          <span>Saved. Your widget shows the change the next time a page loads it.</span>
          <Button variant="ghost" className="min-h-8 px-2" aria-label="Dismiss" onClick={() => setToast(false)}>
            ✕
          </Button>
        </div>
      ) : null}
    </div>
  );
}
