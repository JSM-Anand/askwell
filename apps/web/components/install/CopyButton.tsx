"use client";

import { useState } from "react";
import { trackSnippetCopied } from "../../lib/analytics/client";
import { Button } from "../ui/Button";

export function CopyButton({ text, projectId }: { text: string; projectId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      trackSnippetCopied(projectId);
    } catch {
      setState("failed"); // clipboard blocked: the snippet stays selectable on the page
    }
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <Button variant="secondary" onClick={copy} aria-live="polite">
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
    </Button>
  );
}
