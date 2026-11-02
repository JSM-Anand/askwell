import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, deleteProject, listProjects, renameProject } from "./projects-client";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("projects client", () => {
  it("lists projects", async () => {
    reply(200, { projects: [], plan: "free" });
    await expect(listProjects()).resolves.toEqual({ ok: true, data: { projects: [], plan: "free" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", expect.anything());
  });

  it("creates with a JSON body of just the name", async () => {
    reply(201, { project: { id: "a" } });
    await createProject("Docs");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/projects");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Docs" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("returns the server's error code and message on 402", async () => {
    reply(402, { error: { code: "limit_reached", message: "Your Free plan allows 1 project." } });
    await expect(createProject("Second")).resolves.toEqual({
      ok: false,
      code: "limit_reached",
      message: "Your Free plan allows 1 project.",
    });
  });

  it("renames and deletes by id", async () => {
    reply(200, { project: { id: "a" } });
    await renameProject("a", "New");
    reply(200, { ok: true });
    await deleteProject("a");
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method])).toEqual([
      ["/api/projects/a", "PATCH"],
      ["/api/projects/a", "DELETE"],
    ]);
  });

  it("falls back to a generic error when the body isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error("no json"); } });
    const result = await listProjects();
    expect(result).toMatchObject({ ok: false, code: "internal_error" });
  });

  it.each([
    ["a non-JSON body", null],
    ["a JSON string", "ok"],
    ["a JSON number", 5],
  ])("treats a 200 with %s as a failure, not an empty success", async (_label, body) => {
    reply(200, body);
    await expect(listProjects()).resolves.toEqual({
      ok: false,
      code: "internal_error",
      message: expect.any(String),
    });
  });

  it("treats a 200 whose body can't be parsed as a failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token <"); } });
    await expect(createProject("x")).resolves.toMatchObject({ ok: false, code: "internal_error" });
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(listProjects()).resolves.toMatchObject({ ok: false, code: "network" });
  });
});
