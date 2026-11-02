import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteSource, finalizeUpload, pasteText, putFile, requestUpload } from "./knowledge-client";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("knowledge client", () => {
  it("pastes with a JSON body of the title and text", async () => {
    reply(201, { source: { id: "s" } });
    await pasteText("p1", "FAQ", "Open nine to five.");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/p1/knowledge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ title: "FAQ", content: "Open nine to five." });
  });

  it("asks for an upload URL with the declared type and size", async () => {
    reply(201, { source: { id: "s" }, uploadUrl: "https://x" });
    await requestUpload("p1", "Guide", "pdf", 2048);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects/p1/knowledge/upload-url");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Guide", fileType: "pdf", size: 2048 });
  });

  it("finalizes and deletes by id", async () => {
    reply(200, { source: { id: "s" } });
    await finalizeUpload("p1", "s1");
    reply(200, { ok: true });
    await deleteSource("s1");
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ["/api/projects/p1/knowledge/finalize", "POST"],
      ["/api/knowledge/s1", "DELETE"],
    ]);
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({ sourceId: "s1" });
  });

  it("returns the server's error code and message, so a 402 can be recognised", async () => {
    reply(402, { error: { code: "limit_reached", message: "Your Free plan allows 3 knowledge sources per project." } });
    await expect(pasteText("p1", "x", "y")).resolves.toEqual({
      ok: false,
      code: "limit_reached",
      message: "Your Free plan allows 3 knowledge sources per project.",
    });
  });

  it.each([null, "ok", 5])("treats a 200 with the body %j as a failure", async (body) => {
    reply(200, body);
    await expect(pasteText("p1", "x", "y")).resolves.toMatchObject({ ok: false, code: "internal_error" });
  });

  it("falls back to a generic error when the body isn't JSON, and reports a network failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("no json"); } });
    await expect(deleteSource("s")).resolves.toMatchObject({ ok: false, code: "internal_error" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(deleteSource("s")).resolves.toMatchObject({ ok: false, code: "network" });
  });
});

type Listener = ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 200;
  upload: { onprogress: Listener } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
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

describe("putFile", () => {
  beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeXhr));

  const file = new File(["hello"], "notes.md");

  it("PUTs the file itself to the signed URL with the type's MIME, not the browser's guess", async () => {
    const done = putFile("https://storage.example/upload?token=t", file, "md", () => {});
    expect(FakeXhr.last).toMatchObject({ method: "PUT", url: "https://storage.example/upload?token=t", body: file });
    expect(FakeXhr.last.headers["Content-Type"]).toBe("text/markdown");
    FakeXhr.last.onload?.();
    await expect(done).resolves.toEqual({ ok: true });
  });

  it("uses the right MIME for each type", () => {
    for (const [type, mime] of [["pdf", "application/pdf"], ["txt", "text/plain"]] as const) {
      void putFile("https://x", file, type, () => {});
      expect(FakeXhr.last.headers["Content-Type"]).toBe(mime);
    }
  });

  it("reports progress as a percent", () => {
    const seen: number[] = [];
    void putFile("https://x", file, "pdf", (percent) => seen.push(percent));
    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
    FakeXhr.last.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 });
    expect(seen).toEqual([25, 100]);
  });

  it("fails on a non-2xx answer, a network error and an abort", async () => {
    const bad = putFile("https://x", file, "pdf", () => {});
    FakeXhr.last.status = 413;
    FakeXhr.last.onload?.();
    await expect(bad).resolves.toEqual({ ok: false });

    const offline = putFile("https://x", file, "pdf", () => {});
    FakeXhr.last.onerror?.();
    await expect(offline).resolves.toEqual({ ok: false });

    const aborted = putFile("https://x", file, "pdf", () => {});
    FakeXhr.last.onabort?.();
    await expect(aborted).resolves.toEqual({ ok: false });
  });
});
