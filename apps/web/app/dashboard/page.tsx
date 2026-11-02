import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  await auth.protect();
  return (
    <main className="flex min-h-screen flex-col gap-4 bg-surface p-6 text-fg">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <UserButton />
      </div>
    </main>
  );
}
