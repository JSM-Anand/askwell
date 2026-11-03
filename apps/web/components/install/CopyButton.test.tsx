// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackSnippetCopied = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics/client", () => ({ trackSnippetCopied }));

import { CopyButton } from "./CopyButton";

beforeEach(() => trackSnippetCopied.mockReset());
afterEach(cleanup);

describe("CopyButton analytics", () => {
  it("fires snippet_copied once with the project ID after a successful copy", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(<CopyButton text="<script>" projectId="p1" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(trackSnippetCopied).toHaveBeenCalledTimes(1));
    expect(trackSnippetCopied).toHaveBeenCalledWith("p1");
  });

  it("fires nothing when the clipboard is blocked", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(<CopyButton text="x" projectId="p1" />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByText("Copy failed");
    expect(trackSnippetCopied).not.toHaveBeenCalled();
  });
});
