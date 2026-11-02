import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Relative import: @askwell/db does not depend on @askwell/shared, and this is a test only.
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "../shared/src/index";
import {
  API_ROLES,
  applyMigrations,
  createSupabasePglite,
  execAs,
  queryAs,
} from "./supabase-pglite";

const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;

const vec = (n: number) => `[${Array.from({ length: 1536 }, () => n).join(",")}]`;

const A = { role: "authenticated", claims: { sub: "user_a" } } as const;
const B = { role: "authenticated", claims: { sub: "user_b" } } as const;
const ANON = { role: "anon" } as const;
const SERVICE = { role: "service_role" } as const;

// Ids are fixed so tests can name the other owner's rows.
const P_A = "00000000-0000-4000-8000-0000000000a1";
const P_B = "00000000-0000-4000-8000-0000000000b1";
const S_A = "00000000-0000-4000-8000-0000000000a2";
const S_B = "00000000-0000-4000-8000-0000000000b2";
const C_A = "00000000-0000-4000-8000-0000000000a3";
const C_B = "00000000-0000-4000-8000-0000000000b3";

let db: PGlite;

async function seed(target: PGlite) {
  await target.exec(`
    insert into accounts (clerk_user_id, plan) values ('user_a', 'pro'), ('user_b', 'free');
    insert into projects (id, owner_id, name, public_key) values
      ('${P_A}', 'user_a', 'A project', 'pk_a'),
      ('${P_B}', 'user_b', 'B project', 'pk_b');
    insert into widget_configs (project_id) values ('${P_A}'), ('${P_B}');
    insert into knowledge_sources (id, project_id, title, type) values
      ('${S_A}', '${P_A}', 'A doc', 'text'), ('${S_B}', '${P_B}', 'B doc', 'pdf');
    insert into knowledge_chunks (project_id, source_id, content, embedding) values
      ('${P_A}', '${S_A}', 'a chunk', '${vec(0.1)}'),
      ('${P_B}', '${S_B}', 'b chunk', '${vec(0.2)}');
    insert into conversations (id, project_id, visitor_id) values
      ('${C_A}', '${P_A}', 'v1'), ('${C_B}', '${P_B}', 'v2');
    insert into messages (conversation_id, role, body) values
      ('${C_A}', 'visitor', 'hi a'), ('${C_A}', 'bot', 'hello a'), ('${C_B}', 'visitor', 'hi b');
  `);
}

async function count(context: Parameters<typeof queryAs>[1], table: string, where = "true") {
  const rows = await queryAs<{ n: number }>(db, context, `select count(*)::int as n from ${table} where ${where}`);
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  db = await createSupabasePglite();
  await seed(db);
});

afterAll(async () => {
  await db.close();
});

describe("migration", () => {
  it("applies cleanly and creates the seven tables", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1",
    );
    expect(rows.map((r) => r.table_name).sort()).toEqual([...TABLES].sort());
  });

  it("applies every migration file, in order, to an empty database", async () => {
    const fresh = await createSupabasePglite({ migrate: false });
    const files = await applyMigrations(fresh);
    expect(files.length).toBeGreaterThan(0);
    expect(files).toEqual([...files].sort());
    await fresh.close();
  });

  it("keeps vector in the extensions schema, with an HNSW cosine index", async () => {
    const ext = await db.query<{ schema: string }>(
      "select n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'",
    );
    expect(ext.rows[0]?.schema).toBe("extensions");
    const idx = await db.query<{ def: string }>(
      "select indexdef as def from pg_indexes where tablename = 'knowledge_chunks' and indexname = 'knowledge_chunks_embedding_idx'",
    );
    expect(idx.rows[0]?.def).toMatch(/hnsw/);
    expect(idx.rows[0]?.def).toMatch(/vector_cosine_ops/);
  });

  it("indexes every foreign key column", async () => {
    const { rows } = await db.query<{ t: string; col: string }>(`
      select c.conrelid::regclass::text as t, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
        )`);
    // widget_configs.project_id is its primary key, which is already an index.
    expect(rows).toEqual([]);
  });

  it("defaults messages_used to 0 and requires a unique public_key", async () => {
    const rows = await queryAs<{ messages_used: number }>(db, SERVICE, "select messages_used from projects where id = $1", [P_A]);
    expect(rows[0]?.messages_used).toBe(0);
    await expect(
      execAs(db, SERVICE, "insert into projects (owner_id, name, public_key) values ('user_a', 'dup', 'pk_a')"),
    ).rejects.toThrow(/unique/);
    await expect(
      execAs(db, SERVICE, "insert into projects (owner_id, name) values ('user_a', 'no key')"),
    ).rejects.toThrow(/null value/);
  });
});

describe("enum check constraints match packages/shared", () => {
  const cases: [string, string, readonly string[], string][] = [
    ["accounts", "plan", PLANS, "clerk_user_id"],
    ["widget_configs", "position", WIDGET_POSITIONS, "project_id"],
    ["widget_configs", "animation", WIDGET_ANIMATIONS, "project_id"],
    ["knowledge_sources", "type", KNOWLEDGE_SOURCE_TYPES, "id"],
    ["knowledge_sources", "status", KNOWLEDGE_SOURCE_STATUSES, "id"],
    ["messages", "role", MESSAGE_ROLES, "id"],
  ];

  it.each(cases)("%s.%s accepts every shared value and rejects others", async (table, column, values) => {
    const check = await db.query<{ def: string }>(
      `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       where c.conrelid = 'public.${table}'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%${column}%'`,
    );
    const def = check.rows[0]?.def ?? "";
    const inDb = [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...values].sort());
  });
});

describe("RLS is on and grants are tight", () => {
  it("has RLS on for every table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'",
    );
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it("revokes TRUNCATE from every API role", async () => {
    for (const role of API_ROLES) {
      for (const table of TABLES) {
        const { rows } = await db.query<{ ok: boolean }>(
          "select has_table_privilege($1, $2, 'TRUNCATE') as ok", [role, `public.${table}`],
        );
        expect(rows[0]?.ok, `${role} ${table}`).toBe(false);
      }
    }
    await expect(execAs(db, A, "truncate projects cascade")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, SERVICE, "truncate projects cascade")).rejects.toThrow(/permission denied/);
  });

  it("gives anon no table privilege and no function privilege", async () => {
    for (const table of TABLES) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES", "TRIGGER"]) {
        const { rows } = await db.query<{ ok: boolean }>(
          "select has_table_privilege('anon', $1, $2) as ok", [`public.${table}`, priv],
        );
        expect(rows[0]?.ok, `anon ${priv} ${table}`).toBe(false);
      }
    }
    for (const fn of ["owned_project_ids", "owned_conversation_ids"]) {
      const { rows } = await db.query<{ ok: boolean }>(
        "select has_function_privilege('anon', $1, 'EXECUTE') as ok", [`public.${fn}()`],
      );
      expect(rows[0]?.ok, fn).toBe(false);
    }
  });

  it("makes the helpers SECURITY DEFINER with an empty search_path, executable by authenticated and service_role only", async () => {
    const { rows } = await db.query<{ proname: string; prosecdef: boolean; proconfig: string[] | null; public_exec: boolean }>(`
      select proname, prosecdef, proconfig,
             has_function_privilege('public', oid, 'EXECUTE') as public_exec
      from pg_proc where pronamespace = 'public'::regnamespace`);
    expect(rows.map((r) => r.proname).sort()).toEqual(["owned_conversation_ids", "owned_project_ids"]);
    for (const row of rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain("search_path=\"\"");
      expect(row.public_exec).toBe(false);
    }
    for (const role of ["authenticated", "service_role"]) {
      const { rows: ok } = await db.query<{ ok: boolean }>(
        "select has_function_privilege($1, 'public.owned_project_ids()', 'EXECUTE') as ok", [role],
      );
      expect(ok[0]?.ok).toBe(true);
    }
  });
});

describe("anon", () => {
  it.each(TABLES)("cannot read %s", async (table) => {
    await expect(queryAs(db, ANON, `select * from ${table}`)).rejects.toThrow(/permission denied/);
  });

  it("cannot call the RLS helpers", async () => {
    await expect(queryAs(db, ANON, "select * from owned_project_ids()")).rejects.toThrow(/permission denied/);
  });
});

describe("owner isolation", () => {
  it.each(TABLES)("owner A sees only their own rows in %s", async (table) => {
    const own = await count(A, table);
    const total = await count(SERVICE, table);
    expect(own).toBeGreaterThan(0);
    expect(own).toBeLessThan(total);
  });

  it("owner A cannot read owner B's rows by id", async () => {
    expect(await count(A, "accounts", "clerk_user_id = 'user_b'")).toBe(0);
    expect(await count(A, "projects", `id = '${P_B}'`)).toBe(0);
    expect(await count(A, "widget_configs", `project_id = '${P_B}'`)).toBe(0);
    expect(await count(A, "knowledge_sources", `id = '${S_B}'`)).toBe(0);
    expect(await count(A, "knowledge_chunks", `project_id = '${P_B}'`)).toBe(0);
    expect(await count(A, "conversations", `id = '${C_B}'`)).toBe(0);
    expect(await count(A, "messages", `conversation_id = '${C_B}'`)).toBe(0);
  });

  it("owner A reads their own rows, including messages through the helper", async () => {
    expect(await count(A, "accounts")).toBe(1);
    expect(await count(A, "projects")).toBe(1);
    expect(await count(A, "messages")).toBe(2);
    const ids = await queryAs<{ id: string }>(db, A, "select owned_project_ids() as id");
    expect(ids.map((r) => r.id)).toEqual([P_A]);
  });

  it("owner B sees only their own rows, and A's rows stay hidden from B too", async () => {
    expect(await count(B, "projects")).toBe(1);
    expect(await count(B, "projects", `id = '${P_A}'`)).toBe(0);
    expect(await count(B, "messages")).toBe(1);
    expect(await count(B, "knowledge_chunks", `project_id = '${P_A}'`)).toBe(0);
  });

  it("a token with no sub sees nothing", async () => {
    for (const table of TABLES) {
      expect(await count({ role: "authenticated", claims: {} }, table), table).toBe(0);
    }
  });
});

describe("owner writes", () => {
  it("can rename their own project", async () => {
    expect(await execAs(db, A, "update projects set name = 'Renamed' where id = $1", [P_A])).toBe(1);
    const rows = await queryAs<{ name: string }>(db, SERVICE, "select name from projects where id = $1", [P_A]);
    expect(rows[0]?.name).toBe("Renamed");
  });

  it("cannot rename another owner's project", async () => {
    expect(await execAs(db, A, "update projects set name = 'Hijack' where id = $1", [P_B])).toBe(0);
  });

  it.each(["public_key = 'pk_x'", "messages_used = 0", "owner_id = 'user_b'", "period_start = now()", "id = gen_random_uuid()"])(
    "cannot change projects.%s",
    async (assignment) => {
      await expect(execAs(db, A, `update projects set ${assignment} where id = $1`, [P_A])).rejects.toThrow(/permission denied/);
    },
  );

  it("cannot update any other table", async () => {
    await expect(execAs(db, A, "update accounts set plan = 'pro' where clerk_user_id = 'user_a'")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, A, "update widget_configs set label = 'x'")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, A, "update knowledge_sources set status = 'ready'")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, A, "update messages set body = 'x'")).rejects.toThrow(/permission denied/);
  });

  it("cannot insert into any table", async () => {
    const inserts = [
      "insert into accounts (clerk_user_id) values ('user_c')",
      `insert into projects (owner_id, name, public_key) values ('user_a', 'n', 'pk_new')`,
      `insert into widget_configs (project_id) values (gen_random_uuid())`,
      `insert into knowledge_sources (project_id, title, type) values ('${P_A}', 't', 'text')`,
      `insert into knowledge_chunks (project_id, source_id, content, embedding) values ('${P_A}', '${S_A}', 'c', '${vec(0.3)}')`,
      `insert into conversations (project_id, visitor_id) values ('${P_A}', 'v')`,
      `insert into messages (conversation_id, role, body) values ('${C_A}', 'visitor', 'x')`,
    ];
    for (const sql of inserts) {
      await expect(execAs(db, A, sql), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("cannot delete from any table except their own projects", async () => {
    await expect(execAs(db, A, "delete from accounts")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, A, "delete from messages")).rejects.toThrow(/permission denied/);
    await expect(execAs(db, A, "delete from knowledge_sources")).rejects.toThrow(/permission denied/);
  });

  it("cannot delete another owner's project", async () => {
    expect(await execAs(db, A, "delete from projects where id = $1", [P_B])).toBe(0);
    expect(await count(SERVICE, "projects", `id = '${P_B}'`)).toBe(1);
  });
});

describe("deleting a project", () => {
  it("cascades to every row under it", async () => {
    const scratch = await createSupabasePglite();
    await seed(scratch);
    expect(await execAs(scratch, A, "delete from projects where id = $1", [P_A])).toBe(1);
    for (const [table, where] of [
      ["projects", `id = '${P_A}'`],
      ["widget_configs", `project_id = '${P_A}'`],
      ["knowledge_sources", `project_id = '${P_A}'`],
      ["knowledge_chunks", `project_id = '${P_A}'`],
      ["conversations", `project_id = '${P_A}'`],
      ["messages", `conversation_id = '${C_A}'`],
    ] as const) {
      const rows = await queryAs<{ n: number }>(scratch, SERVICE, `select count(*)::int as n from ${table} where ${where}`);
      expect(rows[0]?.n, table).toBe(0);
    }
    const others = await queryAs<{ n: number }>(scratch, SERVICE, `select count(*)::int as n from messages where conversation_id = '${C_B}'`);
    expect(others[0]?.n).toBe(1);
    await scratch.close();
  });

  it("deleting a source deletes its chunks", async () => {
    const scratch = await createSupabasePglite();
    await seed(scratch);
    await execAs(scratch, SERVICE, "delete from knowledge_sources where id = $1", [S_A]);
    const rows = await queryAs<{ n: number }>(scratch, SERVICE, `select count(*)::int as n from knowledge_chunks where source_id = '${S_A}'`);
    expect(rows[0]?.n).toBe(0);
    await scratch.close();
  });
});

describe("service_role", () => {
  it("reads every row in every table, ignoring RLS", async () => {
    for (const table of TABLES) {
      expect(await count(SERVICE, table), table).toBeGreaterThanOrEqual(2);
    }
  });

  it("can insert, update and delete in every table", async () => {
    const scratch = await createSupabasePglite();
    await seed(scratch);
    const s = SERVICE;
    await execAs(scratch, s, "insert into accounts (clerk_user_id) values ('user_c')");
    await execAs(scratch, s, "insert into projects (id, owner_id, name, public_key) values ('00000000-0000-4000-8000-0000000000c1', 'user_c', 'C', 'pk_c')");
    await execAs(scratch, s, "insert into widget_configs (project_id) values ('00000000-0000-4000-8000-0000000000c1')");
    await execAs(scratch, s, "update projects set messages_used = messages_used + 1, public_key = 'pk_c2' where id = '00000000-0000-4000-8000-0000000000c1'");
    await execAs(scratch, s, "update accounts set plan = 'pro' where clerk_user_id = 'user_c'");
    await execAs(scratch, s, "update widget_configs set label = 'Hi' where project_id = '00000000-0000-4000-8000-0000000000c1'");
    await execAs(scratch, s, "delete from messages");
    await execAs(scratch, s, "delete from accounts where clerk_user_id = 'user_c'");
    expect(await count2(scratch, "projects"), "cascade from account").toBe(2);
    await scratch.close();
  });

  it("cannot truncate", async () => {
    await expect(execAs(db, SERVICE, "truncate messages")).rejects.toThrow(/permission denied/);
  });
});

async function count2(target: PGlite, table: string) {
  const rows = await queryAs<{ n: number }>(target, SERVICE, `select count(*)::int as n from ${table}`);
  return rows[0]?.n ?? 0;
}
