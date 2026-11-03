import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { BillingView } from "../../../components/billing/BillingView";
import { CHECKOUT_DONE_PARAM, CHECKOUT_DONE_VALUE } from "../../../components/billing/billing-state";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { GlassPanel } from "../../../components/ui/GlassPanel";
import { getAccount, planLabel, type Account } from "../../../lib/accounts/get-account";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BillingPage({ searchParams }: PageProps) {
  // The layout checks the session too; each page is its own gate.
  await auth.protect();

  const params = await searchParams;
  const checkedOut = params[CHECKOUT_DONE_PARAM] === CHECKOUT_DONE_VALUE;

  let account: Account | null = null;
  let failed = false;
  try {
    account = await getAccount();
  } catch {
    failed = true;
  }

  return (
    <section aria-labelledby="billing-title" className="flex flex-col gap-4">
      <h1 id="billing-title" className="text-2xl font-semibold">
        Billing
      </h1>

      {failed ? (
        <ErrorState
          message="We could not load your plan. Reload the page to try again."
          action={
            <Link href="/dashboard/billing" className="text-sm font-medium underline underline-offset-2">
              Reload
            </Link>
          }
        />
      ) : account ? (
        <BillingView plan={account.plan} planLabel={planLabel(account.plan)} checkedOut={checkedOut} />
      ) : (
        <GlassPanel>
          <EmptyState
            title="No account yet"
            text="Your account is created when you open the dashboard. Go to Projects, then come back."
            action={
              <Link href="/dashboard" className="text-sm font-medium underline underline-offset-2">
                Go to Projects
              </Link>
            }
          />
        </GlassPanel>
      )}
    </section>
  );
}
