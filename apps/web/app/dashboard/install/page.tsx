import { auth } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { InstallList } from "../../../components/install/InstallList";
import { resolveAppOrigin } from "../../../components/install/app-origin";
import { ErrorState } from "../../../components/ui/ErrorState";
import { createOwnerClient } from "../../../lib/supabase/owner";

export default async function InstallPage() {
  await auth.protect();

  // Owner client: RLS scopes the list to this owner's projects.
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select("id, name, public_key")
    .order("created_at", { ascending: true });

  const requestHeaders = await headers();
  const origin = resolveAppOrigin({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    proto: requestHeaders.get("x-forwarded-proto"),
  });

  return (
    <section aria-labelledby="section-title" className="flex flex-col gap-4">
      <h1 id="section-title" className="text-2xl font-semibold">
        Install
      </h1>
      {error ? (
        <ErrorState message="We couldn't load your projects. Try again in a moment." />
      ) : (
        <InstallList projects={data ?? []} origin={origin} />
      )}
    </section>
  );
}
