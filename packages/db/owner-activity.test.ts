import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, queryAs } from "./supabase-pglite";

const SERVICE = { role: "service_role" } as const;
const ANON = { role: "anon" } as const;
const A = { role: "authenticated", claims: { sub: "owner_a" } } as const;
const B = { role: "authenticated", claims: { sub: "owner_b" } } as const;
const NO_SUB = { role: "authenticated", claims: {} } as const;

const P_A = "00000000-0000-4000-8000-0000000000a1"; // owner_a, the project under test
const P_B = "00000000-0000-4000-8000-0000000000b1"; // owner_b
const P_EMPTY = "00000000-0000-4000-8000-0000000000e1"; // owner_a, no conversations
const P_MANY = "00000000-0000-4000-8000-0000000000f1"; // owner_a, 205 conversations

const cid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DAY = "2026-11-02";

type Row = { id: string; visitor_id: string; created_at: string; message_count: number | bigint; first_message_preview: string | null };

let db: PGlite;

const activity = (ctx: Parameters<typeof queryAs>[1], project: string, limit?: number | null) =>
  limit === undefined
    ? queryAs<Row>(db, ctx, "select * from owner_activity($1)", [project])
    : queryAs<Row>(db, ctx, "select * from owner_activity($1, $2)", [project, limit]);

const byId = (rows: Row[], id: string) => rows.find((r) => r.id === id)!;
const sql = (value: string) => value.replaceAll("'", "''");

/** One conversation of project `project`, created at `hh:mm` on the test day. */
async function conversation(n: number, project: string, at: string, messages: [role: "visitor" | "bot", body: string, at: string][] = []) {
  await db.exec(`insert into conversations (id, project_id, visitor_id, created_at) values ('${cid(n)}', '${project}', 'visitor_${n}', '${DAY}T${at}:00Z')`);
  for (const [role, body, sentAt] of messages) {
    await db.exec(`insert into messages (conversation_id, role, body, created_at) values ('${cid(n)}', '${role}', '${sql(body)}', '${DAY}T${sentAt}Z')`);
  }
}

beforeAll(async () => {
  db = await createSupabasePglite();
  await db.exec(`
    insert into accounts (clerk_user_id) values ('owner_a'), ('owner_b');
    insert into projects (id, owner_id, name, public_key) values
      ('${P_A}', 'owner_a', 'A', 'pk_a'), ('${P_B}', 'owner_b', 'B', 'pk_b'),
      ('${P_EMPTY}', 'owner_a', 'Empty', 'pk_e'), ('${P_MANY}', 'owner_a', 'Many', 'pk_m');
  `);

  // 1: three messages; the earliest visitor message is the preview.
  await conversation(1, P_A, "10:00", [["visitor", "Hi there", "10:00:01"], ["bot", "Hello!", "10:00:02"], ["visitor", "Second question", "10:00:03"]]);
  // 2: a bot message comes first; the preview still comes from the first *visitor* message.
  await conversation(2, P_A, "11:00", [["bot", "Welcome!", "11:00:00"], ["visitor", "Real first message", "11:00:05"]]);
  // 3: a long message is cut to 140 characters.
  await conversation(3, P_A, "12:00", [["visitor", "x".repeat(300), "12:00:01"]]);
  // 4: no messages at all.
  await conversation(4, P_A, "13:00");
  // 5: only a bot message, so no preview.
  await conversation(5, P_A, "14:00", [["bot", "Anyone there?", "14:00:01"]]);
  // 6: exactly 140 characters is kept whole.
  await conversation(6, P_A, "15:00", [["visitor", "a".repeat(140), "15:00:01"]]);
  // 7: 140 characters, not bytes: 200 two-byte letters are cut to 140 letters.
  await conversation(7, P_A, "16:00", [["visitor", "é".repeat(200), "16:00:01"]]);
  // 8: inserted out of order: the later message is stored first, the preview is still the earliest by time.
  await conversation(8, P_A, "17:00", [["visitor", "Later one", "17:00:09"], ["visitor", "Earliest one", "17:00:01"]]);
  // 9 and 10: the same created_at, so the order falls back to id, descending.
  await conversation(9, P_A, "18:00", [["visitor", "Tie nine", "18:00:01"]]);
  await conversation(10, P_A, "18:00", [["visitor", "Tie ten", "18:00:01"]]);

  // Another owner's project, with messages that must never leak into A's counts or previews.
  await conversation(90, P_B, "10:00", [["visitor", "B's private question", "10:00:01"], ["bot", "B's private answer", "10:00:02"]]);

  // 205 conversations for the limit and cap tests, one minute apart.
  await db.exec(`
    insert into conversations (id, project_id, visitor_id, created_at)
    select ('00000000-0000-4000-8000-' || lpad((1000 + g)::text, 12, '0'))::uuid, '${P_MANY}', 'v' || g, timestamptz '${DAY}T00:00:00Z' + g * interval '1 minute'
    from generate_series(1, 205) g;
  `);
});

afterAll(async () => {
  await db.close();
});

describe("owner_activity: counts and previews", () => {
  it("counts all of a conversation's messages, visitor and bot", async () => {
    const rows = await activity(A, P_A);
    expect(Number(byId(rows, cid(1)).message_count)).toBe(3);
    expect(Number(byId(rows, cid(2)).message_count)).toBe(2);
    expect(Number(byId(rows, cid(5)).message_count)).toBe(1);
  });

  it("counts a conversation with no messages as 0, with a null preview", async () => {
    const row = byId(await activity(A, P_A), cid(4));
    expect(Number(row.message_count)).toBe(0);
    expect(row.first_message_preview).toBeNull();
  });

  it("previews the earliest visitor message", async () => {
    expect(byId(await activity(A, P_A), cid(1)).first_message_preview).toBe("Hi there");
  });

  it("ignores bot messages, even one that came first", async () => {
    expect(byId(await activity(A, P_A), cid(2)).first_message_preview).toBe("Real first message");
  });

  it("has a null preview when there is only a bot message", async () => {
    expect(byId(await activity(A, P_A), cid(5)).first_message_preview).toBeNull();
  });

  it("cuts a long message to its first 140 characters, and keeps exactly 140 whole", async () => {
    const rows = await activity(A, P_A);
    expect(byId(rows, cid(3)).first_message_preview).toBe("x".repeat(140));
    expect(byId(rows, cid(6)).first_message_preview).toBe("a".repeat(140));
  });

  it("counts characters, not bytes", async () => {
    expect(byId(await activity(A, P_A), cid(7)).first_message_preview).toBe("é".repeat(140));
  });

  it("picks the earliest message by time, not by the order it was stored", async () => {
    expect(byId(await activity(A, P_A), cid(8)).first_message_preview).toBe("Earliest one");
  });

  it("counts only a conversation's own messages, never another project's", async () => {
    const rows = await activity(A, P_A);
    expect(rows.some((r) => r.first_message_preview?.includes("B's private"))).toBe(false);
    expect(Number(byId(await activity(B, P_B), cid(90)).message_count)).toBe(2);
  });

  it("returns the visitor id and created_at", async () => {
    const row = byId(await activity(A, P_A), cid(1));
    expect(row.visitor_id).toBe("visitor_1");
    expect(new Date(row.created_at).toISOString()).toBe(`${DAY}T10:00:00.000Z`);
  });

  it("returns no rows for a project with no conversations", async () => {
    expect(await activity(A, P_EMPTY)).toEqual([]);
  });

  it("has the documented columns and types", async () => {
    const { rows } = await db.query<{ result: string }>(
      "select pg_get_function_result('public.owner_activity(uuid,integer)'::regprocedure) as result",
    );
    expect(rows[0]?.result).toBe(
      "TABLE(id uuid, visitor_id text, created_at timestamp with time zone, message_count bigint, first_message_preview text)",
    );
  });
});

describe("owner_activity: order", () => {
  it("lists the newest conversation first", async () => {
    const rows = await activity(A, P_A);
    const times = rows.map((r) => new Date(r.created_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(rows[0]?.id).toBe(cid(10));
    expect(rows.at(-1)?.id).toBe(cid(1));
  });

  it("breaks a tie on created_at by id, descending, so the order is stable", async () => {
    const ids = (await activity(A, P_A)).map((r) => r.id);
    expect(ids.indexOf(cid(10))).toBeLessThan(ids.indexOf(cid(9)));
    expect(ids.slice(0, 2)).toEqual([cid(10), cid(9)]);
  });

  it("returns every conversation of the project, and only its own", async () => {
    const ids = (await activity(A, P_A)).map((r) => r.id).sort();
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => cid(i + 1)).sort());
  });
});

describe("owner_activity: limit", () => {
  it("returns 50 by default", async () => {
    expect(await activity(A, P_MANY)).toHaveLength(50);
  });

  it("returns the newest first within the limit", async () => {
    const rows = await activity(A, P_MANY, 3);
    expect(rows.map((r) => r.visitor_id)).toEqual(["v205", "v204", "v203"]);
  });

  it("honours a smaller and a larger limit", async () => {
    expect(await activity(A, P_MANY, 1)).toHaveLength(1);
    expect(await activity(A, P_MANY, 120)).toHaveLength(120);
  });

  it("caps the limit at 200", async () => {
    expect(await activity(A, P_MANY, 200)).toHaveLength(200);
    expect(await activity(A, P_MANY, 201)).toHaveLength(200);
    expect(await activity(A, P_MANY, 1_000_000)).toHaveLength(200);
  });

  it("treats null as the default", async () => {
    expect(await activity(A, P_MANY, null)).toHaveLength(50);
  });

  it.each([0, -1, -1000])("returns no rows, not an error, for a limit of %i", async (limit) => {
    expect(await activity(A, P_MANY, limit)).toEqual([]);
  });

  it("never returns more than the project has", async () => {
    expect(await activity(A, P_A, 200)).toHaveLength(10);
  });
});

describe("owner_activity: who can see what (RLS applies, it runs as the caller)", () => {
  it("shows an owner their own project", async () => {
    expect((await activity(A, P_A)).length).toBeGreaterThan(0);
    expect(await activity(B, P_B)).toHaveLength(1);
  });

  it("returns 0 rows, not an error, for another owner's project", async () => {
    expect(await activity(B, P_A)).toEqual([]);
    expect(await activity(A, P_B)).toEqual([]);
  });

  it("returns 0 rows to a token with no sub", async () => {
    expect(await activity(NO_SUB, P_A)).toEqual([]);
  });

  it("returns 0 rows for a project that doesn't exist", async () => {
    expect(await activity(A, "00000000-0000-4000-8000-000000000000")).toEqual([]);
  });

  it("shows service_role every project, since it bypasses RLS", async () => {
    expect((await activity(SERVICE, P_A)).length).toBe(10);
    expect((await activity(SERVICE, P_B)).length).toBe(1);
  });
});

describe("owner_activity: access and safety", () => {
  it("can't be executed by anon", async () => {
    await expect(activity(ANON, P_A)).rejects.toThrow(/permission denied/);
  });

  it("is executable by authenticated and service_role only", async () => {
    for (const [role, expected] of [["authenticated", true], ["service_role", true], ["anon", false], ["public", false]] as const) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'public.owner_activity(uuid,integer)', 'EXECUTE') as ok",
        [role],
      );
      expect(rows[0]?.ok, role).toBe(expected);
    }
  });

  it("is SECURITY INVOKER, STABLE and has an empty search_path", async () => {
    const { rows } = await db.query<{ prosecdef: boolean; provolatile: string; proconfig: string[] | null }>(
      "select prosecdef, provolatile, proconfig from pg_proc where proname = 'owner_activity'",
    );
    expect(rows[0]?.prosecdef).toBe(false);
    expect(rows[0]?.provolatile).toBe("s");
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });
});
