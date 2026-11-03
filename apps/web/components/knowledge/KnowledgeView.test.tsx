// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import type { KnowledgeSourceSummary } from "@askwell/shared";
import { KnowledgeView } from "./KnowledgeView";

const PROJECT = "11111111-1111-4111-8111-111111111111";

const source = (id: string, over: Partial<KnowledgeSourceSummary> = {}): KnowledgeSourceSummary => ({
  id,
  title: `Source ${id}`,
  type: "text",
  status: "ready",
  createdAt: "2026-11-02T10:00:00Z",
  ...over,
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const called = () => (fetchMock.mock.calls as [string, RequestInit][]).map(([url, init]) => `${init?.method ?? "GET"} ${url}`);
const bodyOf = (call: number) => JSON.parse((fetchMock.mock.calls[call] as [string, RequestInit])[1].body as string);

class FakeXhr {
  static instances: FakeXhr[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 200;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
}

const view = (sources: KnowledgeSourceSummary[] = [], plan: "free" | "pro" = "free") =>
  render(<KnowledgeView projectId={PROJECT} plan={plan} initialSources={sources} />);
// `accept` would hide a wrong file type in the picker; a person can still choose "All files", so don't filter here.
const user = () => userEvent.setup({ applyAccept: false });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  FakeXhr.instances = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("the source list", () => {
  it("shows each source's title, type, status and added date", () => {
    view([
      source("a", { title: "Opening hours", type: "text" }),
      source("b", { title: "Guide", type: "pdf", status: "processing" }),
      source("c", { title: "Notes", type: "md", status: "uploading" }),
      source("d", { title: "Broken", type: "txt", status: "failed" }),
    ]);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByText("Opening hours")).toBeTruthy();
    expect(within(items[0]!).getByText("Pasted text")).toBeTruthy();
    expect(within(items[0]!).getByText("Ready")).toBeTruthy();
    expect(within(items[0]!).getByText("Nov 2, 2026")).toBeTruthy();
    expect(within(items[1]!).getByText("PDF")).toBeTruthy();
  });

  it("shows `uploading` and `processing` both as Processing", () => {
    view([source("a", { status: "uploading" }), source("b", { status: "processing" })]);
    expect(screen.getAllByText("Processing")).toHaveLength(2);
    expect(screen.queryByText("uploading")).toBeNull();
  });

  it("tells the owner what to do about a failed source", () => {
    view([source("a", { status: "failed" })]);
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText(/Delete it and add it again/)).toBeTruthy();
  });

  it("shows an empty state when there are no sources", () => {
    view([]);
    expect(screen.getByText("No knowledge yet")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders titles as text, never HTML", () => {
    view([source("a", { title: "<img src=x onerror=alert(1)>" })]);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });
});

describe("pasting text", () => {
  it("adds the source, shows it Ready and clears the form", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { source: source("new", { title: "FAQ" }) }));
    view();
    const u = user();
    expect((screen.getByRole("button", { name: "Add text" }) as HTMLButtonElement).disabled).toBe(true);

    await u.type(screen.getByLabelText("Title"), "FAQ");
    await u.type(screen.getByLabelText("Text"), "We open at nine.");
    await u.click(screen.getByRole("button", { name: "Add text" }));

    await screen.findByText("Ready");
    expect(called()).toEqual([`POST /api/projects/${PROJECT}/knowledge`]);
    expect(bodyOf(0)).toEqual({ title: "FAQ", content: "We open at nine." });
    expect(screen.getByRole("heading", { name: "FAQ" })).toBeTruthy();
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("");
  });

  it("needs both a title and some text", async () => {
    view();
    const u = user();
    const add = screen.getByRole("button", { name: "Add text" }) as HTMLButtonElement;
    await u.type(screen.getByLabelText("Title"), "FAQ");
    expect(add.disabled).toBe(true);
    await u.type(screen.getByLabelText("Text"), "   ");
    expect(add.disabled).toBe(true);
    await u.type(screen.getByLabelText("Text"), "x");
    expect(add.disabled).toBe(false);
  });

  it("shows how much of the 100,000-character limit is used", async () => {
    view();
    await user().type(screen.getByLabelText("Text"), "hello");
    expect(screen.getByText("5 / 100,000 characters")).toBeTruthy();
  });

  it("keeps what was typed and shows the message when the server says no", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } }));
    view();
    const u = user();
    await u.type(screen.getByLabelText("Title"), "FAQ");
    await u.type(screen.getByLabelText("Text"), "hello");
    await u.click(screen.getByRole("button", { name: "Add text" }));
    await screen.findByText("Something went wrong.");
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe("hello");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

describe("the plan limit", () => {
  it("shows the upgrade message when the server answers 402, and stops accepting more", async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: "limit_reached", message: "Your Free plan allows 3 knowledge sources per project." } }));
    view([source("a")]);
    const u = user();
    await u.type(screen.getByLabelText("Title"), "Fourth");
    await u.type(screen.getByLabelText("Text"), "x");
    await u.click(screen.getByRole("button", { name: "Add text" }));

    await screen.findByText(/Free allows 3 sources per project\. Upgrade to Pro for 25\./);
    expect(screen.getByRole("link", { name: "Upgrade" }).getAttribute("href")).toBe("/dashboard/billing");
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Upload a file") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByText("Something went wrong.")).toBeNull();
  });

  it("shows it from the count, before any request, when a Free project already has 3 sources", () => {
    view([source("a"), source("b"), source("c")]);
    expect(screen.getByText(/Free allows 3 sources per project\. Upgrade to Pro for 25\./)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add text" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not shown with room left", () => {
    view([source("a"), source("b")]);
    expect(screen.queryByText(/Upgrade/)).toBeNull();
  });

  it("tells a Pro owner at 25 sources the cap, with no upgrade link", () => {
    view(Array.from({ length: 25 }, (_, i) => source(String(i))), "pro");
    expect(screen.getByText("Pro allows 25 sources per project.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Upgrade" })).toBeNull();
  });

  it("frees the form again once a source is deleted", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    view([source("a"), source("b"), source("c")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText(/Upgrade/)).toBeNull());
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(false);
  });
});

describe("deleting", () => {
  it("asks to confirm first, and sends nothing until confirmed", async () => {
    view([source("a", { title: "Opening hours" })]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Opening hours" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/Delete “Opening hours”\?/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Opening hours")).toBeTruthy();
  });

  it("puts focus on the safe action, Keep it, when the confirm opens", async () => {
    view([source("a")]);
    await user().click(screen.getByRole("button", { name: "Delete Source a" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep it" }));
  });

  it("gives focus back to the same source's Delete button when the owner picks Keep it", async () => {
    view([source("a"), source("b")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source b" }));
    await u.click(screen.getByRole("button", { name: "Keep it" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete Source b" }));
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Delete Source a" }));
  });

  it("keeps focus handling quiet when a source is actually deleted", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    view([source("a"), source("b")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText("Source a")).toBeNull());
    expect(screen.getByText("Source b")).toBeTruthy();
  });

  it("keeps the source when the owner picks Keep it", async () => {
    view([source("a")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Source a")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes through the API after the confirm, and removes the source", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    view([source("a"), source("b")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText("Source a")).toBeNull());
    expect(called()).toEqual(["DELETE /api/knowledge/a"]);
    expect(screen.getByText("Source b")).toBeTruthy();
  });

  it("shows a source that is already gone (404) as deleted", async () => {
    fetchMock.mockResolvedValueOnce(reply(404, { error: { code: "not_found", message: "No source with that ID." } }));
    view([source("a")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByText("Source a")).toBeNull());
  });

  it("keeps the source and says so when the delete fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: { code: "internal_error", message: "Something went wrong." } }));
    view([source("a")]);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Delete Source a" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await screen.findByText("Something went wrong.");
    expect(screen.getByText("Source a")).toBeTruthy();
  });
});

describe("uploading a file: checked in the browser first", () => {
  const upload = (file: File) => user().upload(screen.getByLabelText("Upload a file"), file);

  it.each(["virus.exe", "photo.png", "notes.docx", "noextension"])("refuses %s with a clear message and sends nothing", async (name) => {
    view();
    await upload(new File(["x"], name));
    expect(await screen.findByText("Choose a PDF, Markdown (.md) or text (.txt) file.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("refuses a file over 10 MB without asking the server", async () => {
    view();
    const big = new File(["x"], "big.pdf");
    Object.defineProperty(big, "size", { value: MAX_KNOWLEDGE_FILE_BYTES + 1 });
    await upload(big);
    expect(await screen.findByText("That file is larger than 10 MB.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("lets a file of exactly 10 MB through to the upload", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl: "https://storage.example/up" }));
    view();
    const exact = new File(["x"], "exact.pdf");
    Object.defineProperty(exact, "size", { value: MAX_KNOWLEDGE_FILE_BYTES });
    await upload(exact);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
  });

  it("can try the same file again after a message", async () => {
    view();
    const bad = new File(["x"], "virus.exe");
    await upload(bad);
    await screen.findByText(/Choose a PDF/);
    await upload(bad);
    expect(screen.getAllByText(/Choose a PDF/)).toHaveLength(1);
  });
});

describe("uploading a file: the whole flow", () => {
  const file = () => new File(["%PDF-1.4 hello"], "Guide.pdf");
  const uploadUrl = "https://storage.example/upload/sign/knowledge/p/s.pdf?token=one-time";

  it("reserves, sends the file straight to the signed URL with progress, then finalizes to Ready", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(201, { source: source("up", { title: "Guide", type: "pdf", status: "uploading" }), uploadUrl }))
      .mockResolvedValueOnce(reply(200, { source: source("up", { title: "Guide", type: "pdf", status: "ready" }) }));
    view();
    const f = file();
    await user().upload(screen.getByLabelText("Upload a file"), f);

    // 1. The reservation: only the title, type and size go to our API.
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    expect(called()).toEqual([`POST /api/projects/${PROJECT}/knowledge/upload-url`]);
    expect(bodyOf(0)).toEqual({ title: "Guide", fileType: "pdf", size: f.size });
    expect(screen.getByText("Uploading 0%")).toBeTruthy();

    // 2. The file goes to Storage, not through our API.
    const xhr = FakeXhr.instances[0]!;
    expect(xhr).toMatchObject({ method: "PUT", url: uploadUrl, body: f });
    expect(xhr.headers["Content-Type"]).toBe("application/pdf");
    act(() => xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 }));
    expect(screen.getByText("Uploading 50%")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Uploading Guide" })).toBeTruthy();
    expect(called()).toHaveLength(1);

    // 3. Once the upload is done, finalize turns it Ready.
    act(() => xhr.onload?.());
    await screen.findByText("Ready");
    expect(called()).toEqual([
      `POST /api/projects/${PROJECT}/knowledge/upload-url`,
      `POST /api/projects/${PROJECT}/knowledge/finalize`,
    ]);
    expect(bodyOf(1)).toEqual({ sourceId: "up" });
    expect(screen.queryByText(/Uploading/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("never puts the file in a request to our API", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }))
      .mockResolvedValueOnce(reply(200, { source: source("up", { type: "pdf" }) }));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    act(() => FakeXhr.instances[0]!.onload?.());
    await screen.findByText("Ready");
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect(typeof init.body).toBe("string");
      expect(init.body).not.toBeInstanceOf(File);
    }
  });

  it("shows Processing while the server reads the file", async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock
      .mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }))
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    act(() => FakeXhr.instances[0]!.onload?.());
    await waitFor(() => expect(called()).toHaveLength(2));
    expect(screen.getByText("Processing")).toBeTruthy();
    finish(reply(200, { source: source("up", { type: "pdf" }) }));
    await screen.findByText("Ready");
  });

  it("shows a failed source when processing fails", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }))
      .mockResolvedValueOnce(reply(200, { source: source("up", { type: "pdf", status: "failed" }) }));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    act(() => FakeXhr.instances[0]!.onload?.());
    await screen.findByText("Failed");
  });

  it("drops the entry and shows the server's message when it refuses the file (a .txt posing as a PDF)", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }))
      .mockResolvedValueOnce(reply(400, { error: { code: "unsupported_file_type", message: "The file is not a PDF." } }));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    act(() => FakeXhr.instances[0]!.onload?.());
    await screen.findByText("The file is not a PDF.");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows the upgrade message when the reservation is refused with 402", async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error: { code: "limit_reached", message: "Your Free plan allows 3 knowledge sources per project." } }));
    view([source("a")]);
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await screen.findByText(/Free allows 3 sources per project\. Upgrade to Pro for 25\./);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.queryAllByRole("listitem")).toHaveLength(1);
  });

  it("says so, and keeps the entry to delete, when the upload to Storage fails", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    FakeXhr.instances[0]!.status = 413;
    act(() => FakeXhr.instances[0]!.onload?.());
    await screen.findByText(/The upload didn't finish/);
    expect(called()).toHaveLength(1); // no finalize
    expect(screen.getByRole("button", { name: /^Delete / })).toBeTruthy();
  });

  it("locks the forms while a file is being added", async () => {
    fetchMock.mockResolvedValueOnce(reply(201, { source: source("up", { type: "pdf", status: "uploading" }), uploadUrl }));
    view();
    await user().upload(screen.getByLabelText("Upload a file"), file());
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
    expect((screen.getByLabelText("Upload a file") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
  });
});
