import { auth } from "@clerk/nextjs/server";
import type { ReactNode } from "react";
import { DashboardShell } from "../../components/dashboard/DashboardShell";
import { ensureAccount } from "../../lib/accounts/ensure-account";
import { getAccount, planLabel } from "../../lib/accounts/get-account";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // The user comes from the verified Clerk session, never from the request.
  const { userId } = await auth.protect();

  await ensureAccount(userId);
  const account = await getAccount();
  if (!account) {
    throw new Error(
      "No account row visible to the owner client. Check that the migration is applied and that Clerk is set up as a third-party auth provider in Supabase.",
    );
  }

  return <DashboardShell planLabel={planLabel(account.plan)}>{children}</DashboardShell>;
}
