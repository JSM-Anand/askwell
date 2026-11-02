import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => {
  const updateMaybeSingle = vi.fn();
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const deleteSelect = vi.fn();
  const deleteEq = vi.fn(() => ({ select: deleteSelect }));
  const del = vi.fn(() => ({ eq: deleteEq }));
  const from = vi.fn(() => ({ update, delete: del }));
  return {
    auth: vi.fn(),
    updateMaybeSingle, updateSelect, updateEq, update,
    deleteSelect, deleteEq, del, from,
    createOwnerClient: vi.fn(() => ({ from })),
    createServiceClient: vi.fn(),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("../../../../lib/supabase/owner", () => ({ createOwnerClient: m.createOwnerClient }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: m.createServiceClient }));

import { DELETE, PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown, raw = false) =>
  PATCH(new Request(`http://localhost:3000/api/projects/${id}`, { method: "PATCH", body: raw ? (body as string) : JSON.stringify(body) }), ctx(id));
const del = (id: string) => DELETE(new Request(`http://localhost:3000/api/projects/${id}`, { method: "DELETE" }), ctx(id));

const row = { id: ID, name: "Renamed", public_key: "pk_abc", messages_used: 3, period_start: "a", created_at: "b" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockResolvedValue({ userId: "user_1" });
});

describe("PATCH /api/projects/:id", () => {
  it("renames the project and returns it", async () => {
    m.updateMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
    const res = await patch(ID, { name: "Renamed" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      project: { id: ID, name: "Renamed", publicKey: "pk_abc", messagesUsed: 3, periodStart: "a", createdAt: "b" },
    });
  });

  it("updates only the name, through the owner client, filtered by id alone", async () => {
    m.updateMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
    await patch(ID, { name: "Renamed", public_key: "pk_x", messages_used: 0, owner_id: "user_2" });
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.update).toHaveBeenCalledWith({ name: "Renamed" });
    expect(m.updateEq).toHaveBeenCalledTimes(1);
    expect(m.updateEq).toHaveBeenCalledWith("id", ID);
  });

  it("is 404 not_found for another owner's or a missing project (RLS returns no row)", async () => {
    m.updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await patch(ID, { name: "Hijack" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
  });

  it.each([
    ["not a uuid", "123", { name: "x" }, false],
    ["empty name", ID, { name: "" }, false],
    ["name too long", ID, { name: "a".repeat(101) }, false],
    ["missing name", ID, {}, false],
    ["not JSON", ID, "{nope", true],
  ] as const)("is 400 invalid_input: %s", async (_label, id, body, raw) => {
    const res = await patch(id, body, raw);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "invalid_input", message: expect.any(String) } });
    expect(m.update).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await patch(ID, { name: "x" });
    expect(res.status).toBe(401);
    expect(m.update).not.toHaveBeenCalled();
  });

  it("is 500 on a database error, without leaking it", async () => {
    m.updateMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await patch(ID, { name: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes the owner's project", async () => {
    m.deleteSelect.mockResolvedValueOnce({ data: [{ id: ID }], error: null });
    const res = await del(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("goes through the owner client, filtered by id alone", async () => {
    m.deleteSelect.mockResolvedValueOnce({ data: [{ id: ID }], error: null });
    await del(ID);
    expect(m.createOwnerClient).toHaveBeenCalledTimes(1);
    expect(m.createServiceClient).not.toHaveBeenCalled();
    expect(m.deleteEq).toHaveBeenCalledTimes(1);
    expect(m.deleteEq).toHaveBeenCalledWith("id", ID);
  });

  it("is 404 not_found for another owner's or a missing project (RLS deletes nothing)", async () => {
    m.deleteSelect.mockResolvedValueOnce({ data: [], error: null });
    const res = await del(ID);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: expect.any(String) } });
  });

  it("is 400 invalid_input for an ID that isn't a uuid", async () => {
    const res = await del("not-a-uuid");
    expect(res.status).toBe(400);
    expect(m.del).not.toHaveBeenCalled();
  });

  it("is 401 when signed out", async () => {
    m.auth.mockResolvedValueOnce({ userId: null });
    const res = await del(ID);
    expect(res.status).toBe(401);
    expect(m.del).not.toHaveBeenCalled();
  });

  it("is 500 on a database error, without leaking it", async () => {
    m.deleteSelect.mockResolvedValueOnce({ data: null, error: { message: "secret detail" } });
    const res = await del(ID);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});
