// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProjectSelector } from "./ProjectSelector";

const projects = [
  { id: "p1", name: "Docs bot" },
  { id: "p2", name: "Support bot" },
];

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("ProjectSelector", () => {
  it("lists the projects and selects the current one", () => {
    render(<ProjectSelector projects={projects} selectedId="p2" />);
    const select = screen.getByLabelText("Project") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(["Docs bot", "Support bot"]);
    expect(select.value).toBe("p2");
  });

  it("puts the chosen project in ?project= so the page can be linked and reloaded", async () => {
    render(<ProjectSelector projects={projects} selectedId="p1" />);
    await userEvent.selectOptions(screen.getByLabelText("Project"), "p2");
    expect(push).toHaveBeenCalledWith("/dashboard/knowledge?project=p2");
  });

  it("encodes the ID in the URL", async () => {
    render(<ProjectSelector projects={[{ id: "a&b=c", name: "Odd" }, { id: "p1", name: "Docs bot" }]} selectedId="p1" />);
    await userEvent.selectOptions(screen.getByLabelText("Project"), "a&b=c");
    expect(push).toHaveBeenCalledWith("/dashboard/knowledge?project=a%26b%3Dc");
  });
});
