"use client";

import { useClerk, PricingTable } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Plan } from "@askwell/shared";
import { Button } from "../ui/Button";
import { GlassPanel } from "../ui/GlassPanel";
import { Spinner } from "../ui/Spinner";
import {
  CHECKOUT_REDIRECT_URL,
  POLL_INTERVAL_MS,
  upgradeStatus,
} from "./billing-state";
import { PlanCard } from "./PlanCard";

// Our light dashboard tokens as literal values: Clerk cannot derive contrast from CSS variables.
const clerkAppearance = {
  variables: {
    colorPrimary: "#09090b",
    colorPrimaryForeground: "#ffffff",
    colorForeground: "#09090b",
    colorMutedForeground: "#52525b",
    colorBackground: "#ffffff",
    colorNeutral: "#09090b",
    borderRadius: "0.75rem",
  },
  elements: { rootBox: { width: "100%", maxWidth: "100%" } },
};

export type BillingViewProps = {
  plan: Plan;
  planLabel: string;
  /** True when the owner just came back from Clerk's checkout. */
  checkedOut: boolean;
};

export function BillingView({ plan, planLabel, checkedOut }: BillingViewProps) {
  const router = useRouter();
  const clerk = useClerk();
  const [polls, setPolls] = useState(0);
  const status = upgradeStatus({ plan, checkedOut, polls });

  // The webhook moves our plan a few seconds after checkout. Re-read it a few times.
  useEffect(() => {
    if (status !== "waiting") return;
    const timer = setTimeout(() => {
      router.refresh();
      setPolls((n) => n + 1);
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status, polls, router]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {status === "waiting" ? (
        <GlassPanel role="status" className="flex items-center gap-3">
          <Spinner label="Updating your plan" />
          <p className="text-sm">Updating your plan…</p>
        </GlassPanel>
      ) : null}

      {status === "stalled" ? (
        <GlassPanel role="status" className="flex flex-col items-start gap-2">
          <p className="text-sm">
            Your plan still shows as Free. If you just paid, the update can take a minute. Refresh in a minute.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setPolls(0);
              router.refresh();
            }}
          >
            Refresh
          </Button>
        </GlassPanel>
      ) : null}

      {status === "done" ? (
        <GlassPanel role="status" className="text-sm">
          You are on Pro. Customize and the higher limits are on.
        </GlassPanel>
      ) : null}

      <PlanCard plan={plan} label={planLabel} />

      <GlassPanel className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Plans</h2>
          <Button variant="secondary" onClick={() => clerk.openUserProfile()}>
            Manage subscription
          </Button>
        </div>
        <div className="-m-2 min-w-0 overflow-x-auto p-2">
          <PricingTable
            appearance={clerkAppearance}
            checkoutProps={{ appearance: clerkAppearance }}
            newSubscriptionRedirectUrl={CHECKOUT_REDIRECT_URL}
          />
        </div>
      </GlassPanel>
    </div>
  );
}

