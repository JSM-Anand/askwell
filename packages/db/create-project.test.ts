import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, execAs, queryAs } from "./supabase-pglite";

const SERVICE = { role: "service_role" } as const;
const ANON = { role: "anon" } as const;
const OWNER = { role: "authenticated", claims: { sub: "owner_1" } } as const;

const CALL = "select * from create_project($1, $2, $3, $4)";

let db: PGlite;
let n = 0;
const key = () => `pk_test_${++n}`;

const create = (owner: string, name: string, max: number, publicKey = key()) =>
  queryAs<{ id: string; owner_id: string; name: string; public_key: string; messages_used: number }>(
    db,
    SERVICE,
    CALL,
    [owner, name, publicKey, max],
  );

const count = async (table: string, where = "true") => {
  const rows = await queryAs<{ n: number }>(db, SERVICE, `select count(*)::int as n from ${table} where ${where}`);
  return rows[0]?.n ?? 0;
};

beforeAll(async () => {
  db = await createSupabasePglite();
  await db.exec(`insert into accounts (clerk_user_id, plan) values
    ('owner_1', 'free'), ('owner_2', 'free'), ('owner_pro', 'pro'), ('owner_race', 'free')`);
});

afterAll(async () => {
  await db.close();
});

describe("create_project", () => {
  it("creates the project and its widget config with the table defaults", async () => {
    const [project] = await create("owner_1", "First", 1, "pk_first");
    expect(project).toMatchObject({ owner_id: "owner_1", name: "First", public_key: "pk_first", messages_used: 0 });

    const config = await queryAs(db, SERVICE, "select * from widget_configs where project_id = $1", [project?.id]);
    expect(config).toEqual([
      {
        project_id: project?.id,
        button_color: "#000000",
        position: "bottom-right",
        label: "Ask us",
        animation: "fade",
        header_text: "Chat with us",
        show_badge: true,
      },
    ]);
  });

  it("refuses a project over the limit with AW001 and creates nothing", async () => {
    // owner_1 already has one project and the limit is 1.
    await expect(create("owner_1", "Second", 1)).rejects.toMatchObject({
      message: "project_limit_reached",
      code: "AW001",
    });
    expect(await count("projects", "owner_id = 'owner_1'")).toBe(1);
    expect(await count("widget_configs", "project_id in (select id from projects where owner_id = 'owner_1')")).toBe(1);
  });

  it("allows up to the limit, then refuses (Pro limit 5)", async () => {
    for (let i = 1; i <= 5; i++) await create("owner_pro", `P${i}`, 5);
    await expect(create("owner_pro", "P6", 5)).rejects.toMatchObject({ code: "AW001" });
    expect(await count("projects", "owner_id = 'owner_pro'")).toBe(5);
  });

  it("counts each owner's projects separately", async () => {
    await expect(create("owner_2", "Mine", 1)).resolves.toHaveLength(1);
  });

  it("refuses an unknown account with AW002", async () => {
    await expect(create("nobody", "X", 1)).rejects.toMatchObject({ message: "account_not_found", code: "AW002" });
    expect(await count("projects", "owner_id = 'nobody'")).toBe(0);
  });

  it("refuses a missing limit", async () => {
    await expect(
      queryAs(db, SERVICE, "select * from create_project('owner_2', 'x', 'pk_x', null)"),
    ).rejects.toThrow(/p_max_projects is required/);
  });

  it("raises a unique violation for a duplicate public key and rolls the project back", async () => {
    const before = await count("projects", "owner_id = 'owner_pro'");
    await expect(create("owner_pro", "Dup", 99, "pk_first")).rejects.toMatchObject({ code: "23505" });
    expect(await count("projects", "owner_id = 'owner_pro'")).toBe(before);
  });

  it("lets the owner read the new project and its config through RLS", async () => {
    const rows = await queryAs<{ name: string }>(db, OWNER, "select name from projects");
    expect(rows.map((r) => r.name)).toEqual(["First"]);
    expect(await queryAs(db, OWNER, "select 1 from widget_configs")).toHaveLength(1);
  });
});

describe("create_project: concurrent creates with limit 1", () => {
  // pglite runs one connection, so these two transactions are queued rather than
  // truly interleaved. This proves the outcome (exactly one row); the lock that
  // makes it hold on real Postgres is asserted by the "locks the account row" test.
  it("exactly one of two simultaneous calls succeeds", async () => {
    const results = await Promise.allSettled([create("owner_race", "A", 1), create("owner_race", "B", 1)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({ code: "AW001" });
    expect(await count("projects", "owner_id = 'owner_race'")).toBe(1);
    expect(await count("widget_configs", "project_id in (select id from projects where owner_id = 'owner_race')")).toBe(1);
  });

  it("locks the owner's account row before counting", async () => {
    const { rows } = await db.query<{ src: string }>(
      "select pg_get_functiondef('public.create_project(text,text,text,integer)'::regprocedure) as src",
    );
    const src = rows[0]?.src ?? "";
    const lock = src.search(/from public\.accounts where clerk_user_id = p_owner_id for update/);
    const count = src.search(/select count\(\*\) from public\.projects/);
    expect(lock).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(lock);
  });
});

describe("create_project: access", () => {
  it("is SECURITY INVOKER with an empty search_path", async () => {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      "select prosecdef, proconfig from pg_proc where proname = 'create_project'",
    );
    expect(rows[0]?.prosecdef).toBe(false);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });

  it("is executable by service_role only", async () => {
    for (const [role, expected] of [
      ["service_role", true],
      ["anon", false],
      ["authenticated", false],
      ["public", false],
    ] as const) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'public.create_project(text,text,text,integer)', 'EXECUTE') as ok",
        [role],
      );
      expect(rows[0]?.ok, role).toBe(expected);
    }
  });

  it("denies anon and authenticated when they call it", async () => {
    const args = ["owner_1", "Hack", "pk_hack", 99];
    await expect(queryAs(db, ANON, CALL, args)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, OWNER, CALL, args)).rejects.toThrow(/permission denied/);
    await expect(execAs(db, OWNER, CALL, args)).rejects.toThrow(/permission denied/);
    expect(await count("projects", "name = 'Hack'")).toBe(0);
  });
});
