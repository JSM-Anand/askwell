import type { ProjectSummary } from "@askwell/shared";
import { EmptyState } from "../ui/EmptyState";
import { ProjectCard } from "./ProjectCard";
import type { ProjectCardProps } from "./ProjectCard";

export type ProjectsListProps = {
  projects: ProjectSummary[];
  editingId: string | null;
  confirmingId: string | null;
  busyId?: string | null;
  handlers: {
    onStartEdit: (id: string) => void;
    onCancelEdit: () => void;
    onRename: (id: string, name: string) => void;
    onAskDelete: (id: string) => void;
    onCancelDelete: () => void;
    onConfirmDelete: (id: string) => void;
  };
};

export function ProjectsList({ projects, editingId, confirmingId, busyId = null, handlers }: ProjectsListProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects yet"
        text="Create your first project above. Each one gets its own chat widget."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {projects.map((project) => {
        const props: ProjectCardProps = {
          project,
          editing: editingId === project.id,
          confirmingDelete: confirmingId === project.id,
          busy: busyId === project.id,
          onStartEdit: () => handlers.onStartEdit(project.id),
          onCancelEdit: handlers.onCancelEdit,
          onRename: (name) => handlers.onRename(project.id, name),
          onAskDelete: () => handlers.onAskDelete(project.id),
          onCancelDelete: handlers.onCancelDelete,
          onConfirmDelete: () => handlers.onConfirmDelete(project.id),
        };
        return <ProjectCard key={project.id} {...props} />;
      })}
    </ul>
  );
}
