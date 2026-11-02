import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@askwell/shared";
import { CreateProjectForm } from "./CreateProjectForm";
import { ProjectsList } from "./ProjectsList";
import { limitInfo } from "./projects-state";

const project = (id: string, name: string): ProjectSummary => ({
  id,
  name,
  publicKey: `pk_${id.repeat(8)}`,
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00Z",
  createdAt: "2026-11-02T10:00:00Z",
});

const noop = vi.fn();
const handlers = {
  onStartEdit: noop, onCancelEdit: noop, onRename: noop,
  onAskDelete: noop, onCancelDelete: noop, onConfirmDelete: noop,
};
const list = (props: Partial<Parameters<typeof ProjectsList>[0]> = {}) =>
  renderToStaticMarkup(
    <ProjectsList projects={[]} editingId={null} confirmingId={null} handlers={handlers} {...props} />,
  );

describe("ProjectsList", () => {
  it("renders each project's name, public key and created date", () => {
    const html = list({ projects: [project("a", "Docs bot"), project("b", "Support <b>bot</b>")] });
    expect(html).toContain("Docs bot");
    expect(html).toContain("pk_aaaaaaaa");
    expect(html).toContain("pk_bbbbbbbb");
    expect(html).toContain("Nov 2, 2026");
    expect(html).toContain('dateTime="2026-11-02T10:00:00Z"');
    expect(html.match(/<li /g)).toHaveLength(2);
  });

  it("renders project names as text, never HTML", () => {
    const html = list({ projects: [project("a", "<img src=x onerror=alert(1)>")] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("shows the empty state when there are no projects", () => {
    const html = list();
    expect(html).toContain("No projects yet");
    expect(html).not.toContain("<li ");
  });

  it("offers Rename and Delete, and no confirm until Delete is asked", () => {
    const html = list({ projects: [project("a", "Docs bot")] });
    expect(html).toContain('aria-label="Rename Docs bot"');
    expect(html).toContain('aria-label="Delete Docs bot"');
    expect(html).not.toContain("Yes, delete");
  });

  it("asks to confirm a delete before anything is removed", () => {
    const html = list({ projects: [project("a", "Docs bot")], confirmingId: "a" });
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain("Delete “Docs bot”?");
    expect(html).toContain("Yes, delete");
    expect(html).toContain("Keep it");
  });

  it("shows an inline rename field for the project being edited only", () => {
    const html = list({ projects: [project("a", "Docs bot"), project("b", "Other")], editingId: "a" });
    expect(html).toContain('id="rename-a"');
    expect(html).not.toContain('id="rename-b"');
    expect(html).toContain("Save");
  });
});

describe("CreateProjectForm", () => {
  const form = (state: Parameters<typeof limitInfo>[0], busy = false) =>
    renderToStaticMarkup(<CreateProjectForm limit={limitInfo(state)} busy={busy} onCreate={noop} />);

  it("is enabled while there is room, with no limit message", () => {
    const html = form({ plan: "free", projects: [], serverLimit: false });
    expect(html).toContain("Create project");
    expect(html).not.toContain("Upgrade");
    expect(html).not.toMatch(/<input[^>]* disabled=""/);
    expect(html).not.toMatch(/<button type="submit"[^>]* disabled=""[^>]*>Creating/);
  });

  it("is disabled at the Free limit with the upgrade message and a billing link", () => {
    const html = form({ plan: "free", projects: [project("a", "A")], serverLimit: false });
    expect(html).toContain("Free allows 1 project. Upgrade to Pro for 5.");
    expect(html).toContain('href="/dashboard/billing"');
    expect(html).toMatch(/<input[^>]* disabled=""/);
    expect(html).toMatch(/<button type="submit"[^>]* disabled=""[^>]*>Create project/);
  });

  it("shows the same message when the server answered 402, even with no projects listed", () => {
    const html = form({ plan: "free", projects: [], serverLimit: true });
    expect(html).toContain("Free allows 1 project. Upgrade to Pro for 5.");
    expect(html).toMatch(/<button type="submit"[^>]* disabled=""/);
    expect(html).toMatch(/<input[^>]* disabled=""/);
  });

  it("has no upgrade link for a Pro owner at the limit", () => {
    const projects = Array.from({ length: 5 }, (_, i) => project(String(i), `P${i}`));
    const html = form({ plan: "pro", projects, serverLimit: false });
    expect(html).toContain("Pro allows 5 projects.");
    expect(html).not.toContain("/dashboard/billing");
  });

  it("shows a busy label while creating", () => {
    expect(form({ plan: "free", projects: [], serverLimit: false }, true)).toContain("Creating…");
  });
});
