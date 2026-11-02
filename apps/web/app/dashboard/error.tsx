"use client";

import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      message="We couldn't load this page. Try again in a moment."
      action={<Button variant="secondary" onClick={reset}>Try again</Button>}
    />
  );
}
