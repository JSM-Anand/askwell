import { auth } from "@clerk/nextjs/server";
import { ProjectsView } from "../../components/projects/ProjectsView";

export default async function DashboardPage() {
  // The layout checks the session too; each page is its own gate.
  await auth.protect();
  return <ProjectsView />;
}
