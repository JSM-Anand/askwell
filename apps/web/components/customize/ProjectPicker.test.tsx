// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProjectPicker } from "./ProjectPicker";

const projects = [{ id: "p1", name: "Docs bot" }, { id: "p2", name: "Support bot" }];

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("ProjectPicker", () => {
  it("lists the projects and selects the current one", () => {
    render(<ProjectPicker projects={projects} selectedId="p2" />);
    const select = screen.getByLabelText("Project") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.text)).toEqual(["Docs bot", "Support bot"]);
    expect(select.value).toBe("p2");
  });

  it("goes to the chosen project's Customize page", async () => {
    render(<ProjectPicker projects={projects} selectedId="p1" />);
    await userEvent.selectOptions(screen.getByLabelText("Project"), "p2");
    expect(push).toHaveBeenCalledWith("/dashboard/customize?project=p2");
  });
});
