import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, execAs, queryAs } from "./supabase-pglite";

const SERVICE = { role: "service_role" } as const;
const ANON = { role: "anon" } as const;
const OWNER = { role: "authenticated", claims: { sub: "owner_1" } } as const;

type Source = { id: string; project_id: string; title: string; type: string; storage_key: string | null; status: string };

let db: PGlite;

const row = async <T extends object>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T extends object>(sql: string, params: unknown[] = []) => {
  const first = (await row<T>(sql, params))[0];
  if (!first) throw new Error(`no row for: ${sql}`);
  return first;
};
const count = async (sql: string, params: unknown[] = []) => (await row<{ n: number }>(sql, params))[0]?.n ?? 0;

/** A 1536-dim vector as pgvector text, with the given values at the given indexes and 0 elsewhere. */
const vec = (hot: Record<number, number>) =>
  `[${Array.from({ length: 1536 }, (_, i) => hot[i] ?? 0).join(",")}]`;

const project = async (id: string, owner = "owner_1") => {
  await db.exec(`insert into projects (id, owner_id, name, public_key) values ('${id}', '${owner}', 'P ${id.slice(-4)}', 'pk_${id}')`);
};

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const P_RACE = "00000000-0000-4000-8000-000000000003";
const P_STALE = "00000000-0000-4000-8000-000000000004";
const P_QUOTA = "00000000-0000-4000-8000-000000000005";
const P_RACE_MSG = "00000000-0000-4000-8000-000000000006";
const P_CHAT_A = "00000000-0000-4000-8000-000000000007";
const P_CHAT_B = "00000000-0000-4000-8000-000000000008";
const P_MATCH_A = "00000000-0000-4000-8000-000000000009";
const P_MATCH_B = "00000000-0000-4000-8000-00000000000a";
const NO_SUCH = "00000000-0000-4000-8000-0000000000ff";

const reserve = (projectId: string, title: string, type: string, max: number) =>
  queryAs<Source>(db, SERVICE, "select * from reserve_knowledge_source($1, $2, $3, $4)", [projectId, title, type, max]);

const consume = async (projectId: string, limit: number) =>
  (await queryAs<{ consume_message: boolean }>(db, SERVICE, "select consume_message($1, $2)", [projectId, limit]))[0]
    ?.consume_message;

const usage = async (projectId: string) =>
  (await row<{ messages_used: number; period_start: Date }>("select messages_used, period_start from projects where id = $1", [projectId]))[0]!;

beforeAll(async () => {
  db = await createSupabasePglite();
  await db.exec(`insert into accounts (clerk_user_id) values ('owner_1'), ('owner_2')`);
  for (const id of [P1, P_RACE, P_STALE, P_QUOTA, P_RACE_MSG, P_CHAT_A, P_MATCH_A]) await project(id);
  for (const id of [P2, P_CHAT_B, P_MATCH_B]) await project(id, "owner_2");
});

afterAll(async () => {
  await db.close();
});

describe("knowledge bucket", () => {
  it("is private, 10 MB, and limited to PDF, Markdown and TXT", async () => {
    const bucket = await one<{ id: string; public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      "select * from storage.buckets where id = 'knowledge'",
    );
    expect(bucket.public).toBe(false);
    expect(Number(bucket.file_size_limit)).toBe(10 * 1024 * 1024);
    expect([...bucket.allowed_mime_types].sort()).toEqual(["application/pdf", "text/markdown", "text/plain"]);
  });
});

describe("reserve_knowledge_source", () => {
  it("reserves a file as uploading with storage_key <project>/<source>.<type>", async () => {
    for (const type of ["pdf", "md", "txt"]) {
      const [source] = await reserve(P1, `A ${type}`, type, 99);
      expect(source).toMatchObject({ project_id: P1, title: `A ${type}`, type, status: "uploading" });
      expect(source?.storage_key).toBe(`${P1}/${source?.id}.${type}`);
    }
  });

  it("reserves pasted text as processing with no storage_key", async () => {
    const [source] = await reserve(P1, "Pasted", "text", 99);
    expect(source).toMatchObject({ type: "text", status: "processing", storage_key: null });
  });

  it("refuses a bad type through the table's check constraint", async () => {
    await expect(reserve(P1, "Bad", "exe", 99)).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses an unknown project with AW004", async () => {
    await expect(reserve(NO_SUCH, "X", "text", 3)).rejects.toMatchObject({ code: "AW004", message: "project_not_found" });
  });

  it("refuses a missing limit", async () => {
    await expect(
      queryAs(db, SERVICE, "select * from reserve_knowledge_source($1, 'x', 'text', null)", [P1]),
    ).rejects.toThrow(/p_max_sources is required/);
  });

  describe("the limit of 3", () => {
    it("allows 3 sources (files and text together), refuses the 4th with AW003, and creates nothing", async () => {
      await reserve(P2, "One", "pdf", 3);
      await reserve(P2, "Two", "text", 3);
      await reserve(P2, "Three", "md", 3);
      await expect(reserve(P2, "Four", "text", 3)).rejects.toMatchObject({ code: "AW003", message: "source_limit_reached" });
      await expect(reserve(P2, "Five", "pdf", 3)).rejects.toMatchObject({ code: "AW003" });
      expect(await count("select count(*)::int as n from knowledge_sources where project_id = $1", [P2])).toBe(3);
    });

    it("counts every status: ready, failed, processing and uploading", async () => {
      const p = "00000000-0000-4000-8000-0000000000a1";
      await project(p);
      await db.exec(`insert into knowledge_sources (project_id, title, type, status) values
        ('${p}', 'r', 'text', 'ready'), ('${p}', 'f', 'text', 'failed'), ('${p}', 'p', 'text', 'processing')`);
      await reserve(p, "u", "pdf", 4); // 3 existing + this one = the limit
      await expect(reserve(p, "over", "text", 4)).rejects.toMatchObject({ code: "AW003" });
    });

    it("counts each project's sources separately", async () => {
      await expect(reserve(P1, "Still room", "text", 99)).resolves.toHaveLength(1);
    });

    // pglite runs one connection, so these calls are queued rather than truly
    // interleaved. This proves the outcome (exactly 3 rows); the lock that makes it
    // hold on real Postgres is asserted by "locks the project row" below.
    it("exactly 3 of 6 simultaneous reserves succeed", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => reserve(P_RACE, `R${i}`, i % 2 ? "pdf" : "text", 3)),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      for (const r of results.filter((r): r is PromiseRejectedResult => r.status === "rejected")) {
        expect(r.reason).toMatchObject({ code: "AW003" });
      }
      expect(await count("select count(*)::int as n from knowledge_sources where project_id = $1", [P_RACE])).toBe(3);
    });

    it("locks the project row before deleting stale rows and counting", async () => {
      const { src } = await one<{ src: string }>(
        "select pg_get_functiondef('public.reserve_knowledge_source(uuid,text,text,integer)'::regprocedure) as src",
      );
      const lock = src.search(/from public\.projects where id = p_project_id for update/);
      const del = src.search(/delete from public\.knowledge_sources/);
      const cnt = src.search(/select count\(\*\) from public\.knowledge_sources/);
      expect(lock).toBeGreaterThan(-1);
      expect(del).toBeGreaterThan(lock);
      expect(cnt).toBeGreaterThan(del);
    });
  });

  describe("stale reservations", () => {
    it("reclaims uploading rows older than 2 hours, and only those", async () => {
      const ids = await row<{ id: string; title: string }>(`insert into knowledge_sources (project_id, title, type, status, created_at) values
        ('${P_STALE}', 'stale upload', 'pdf', 'uploading', now() - interval '3 hours'),
        ('${P_STALE}', 'recent upload', 'pdf', 'uploading', now() - interval '1 hour'),
        ('${P_STALE}', 'old but processing', 'pdf', 'processing', now() - interval '5 hours')
        returning id, title`);
      expect(ids).toHaveLength(3);

      // The project is at its limit of 3, but the stale slot is reclaimed first.
      const [fresh] = await reserve(P_STALE, "New", "text", 3);
      expect(fresh?.title).toBe("New");

      const titles = (await row<{ title: string }>("select title from knowledge_sources where project_id = $1 order by title", [P_STALE])).map((r) => r.title);
      expect(titles).toEqual(["New", "old but processing", "recent upload"]);
    });

    it("does not reclaim another project's stale rows", async () => {
      await db.exec(`insert into knowledge_sources (project_id, title, type, status, created_at)
        values ('${P2}', 'other project stale', 'pdf', 'uploading', now() - interval '9 hours')`);
      await expect(reserve(P_STALE, "Extra", "text", 3)).rejects.toMatchObject({ code: "AW003" });
      expect(await count("select count(*)::int as n from knowledge_sources where title = 'other project stale'")).toBe(1);
    });

    it("keeps an uploading row that is exactly under 2 hours old", async () => {
      const p = "00000000-0000-4000-8000-0000000000a2";
      await project(p);
      await db.exec(`insert into knowledge_sources (project_id, title, type, status, created_at)
        values ('${p}', 'just under', 'pdf', 'uploading', now() - interval '119 minutes')`);
      await expect(reserve(p, "No room", "text", 1)).rejects.toMatchObject({ code: "AW003" });
    });
  });
});

describe("consume_message", () => {
  it("counts up to the limit, then returns false and changes nothing", async () => {
    expect(await consume(P_QUOTA, 3)).toBe(true);
    expect(await consume(P_QUOTA, 3)).toBe(true);
    expect(await consume(P_QUOTA, 3)).toBe(true);
    expect((await usage(P_QUOTA)).messages_used).toBe(3);

    const before = await usage(P_QUOTA);
    expect(await consume(P_QUOTA, 3)).toBe(false);
    expect(await usage(P_QUOTA)).toEqual(before);
  });

  it("uses the limit it is given: a higher limit has room again", async () => {
    expect(await consume(P_QUOTA, 4)).toBe(true);
    expect((await usage(P_QUOTA)).messages_used).toBe(4);
  });

  it("starts a new period when period_start is more than a month ago", async () => {
    const p = "00000000-0000-4000-8000-0000000000b1";
    await project(p);
    await db.exec(`update projects set messages_used = 100, period_start = now() - interval '1 month 1 day' where id = '${p}'`);

    // At the limit of 100 for the old period, but the period has rolled over.
    expect(await consume(p, 100)).toBe(true);
    const after = await usage(p);
    expect(after.messages_used).toBe(1);
    expect(Date.now() - after.period_start.getTime()).toBeLessThan(60_000);

    expect(await consume(p, 100)).toBe(true);
    expect((await usage(p)).messages_used).toBe(2);
  });

  it("does not roll over a period that is less than a month old", async () => {
    const p = "00000000-0000-4000-8000-0000000000b2";
    await project(p);
    await db.exec(`update projects set messages_used = 100, period_start = now() - interval '29 days' where id = '${p}'`);
    const before = await usage(p);
    expect(await consume(p, 100)).toBe(false);
    expect(await usage(p)).toEqual(before);
  });

  it("refuses a limit below 1, even across a rollover", async () => {
    const p = "00000000-0000-4000-8000-0000000000b3";
    await project(p);
    await db.exec(`update projects set messages_used = 5, period_start = now() - interval '2 months' where id = '${p}'`);
    const before = await usage(p);
    expect(await consume(p, 0)).toBe(false);
    expect(await usage(p)).toEqual(before);
  });

  it("returns false for an unknown project and rejects a missing limit", async () => {
    expect(await consume(NO_SUCH, 100)).toBe(false);
    await expect(queryAs(db, SERVICE, "select consume_message($1, null)", [P_QUOTA])).rejects.toThrow(/p_limit is required/);
  });

  // pglite runs one connection (see the reserve test); the single-UPDATE shape that
  // makes this safe on real Postgres is asserted below.
  it("exactly 3 of 8 simultaneous messages are counted at a limit of 3", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consume(P_RACE_MSG, 3)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await usage(P_RACE_MSG)).messages_used).toBe(3);
  });

  it("decides and writes in one UPDATE", async () => {
    const { src } = await one<{ src: string }>(
      "select pg_get_functiondef('public.consume_message(uuid,integer)'::regprocedure) as src",
    );
    expect(src.match(/\bupdate public\.projects\b/g)).toHaveLength(1);
    expect(src).toMatch(/messages_used < p_limit/);
    expect(src).not.toMatch(/\bselect\b[^;]*messages_used/);
  });
});

describe("save_chat_turn", () => {
  const save = (projectId: string, conversationId: string | null, visitor: string, message: string, reply: string) =>
    queryAs<{ save_chat_turn: string }>(db, SERVICE, "select save_chat_turn($1, $2, $3, $4, $5)", [
      projectId,
      conversationId,
      visitor,
      message,
      reply,
    ]).then((rows) => rows[0]!.save_chat_turn);

  const messages = (conversationId: string) =>
    row<{ role: string; body: string; created_at: Date }>(
      "select role, body, created_at from messages where conversation_id = $1 order by created_at",
      [conversationId],
    );

  it("creates a conversation for a null id and stores both messages, visitor first", async () => {
    const id = await save(P_CHAT_A, null, "visitor_1", "What is this?", "A chat widget.");
    const conversation = await one<{ project_id: string; visitor_id: string }>(
      "select project_id, visitor_id from conversations where id = $1",
      [id],
    );
    expect(conversation).toEqual({ project_id: P_CHAT_A, visitor_id: "visitor_1" });

    const stored = await messages(id);
    expect(stored.map((m) => [m.role, m.body])).toEqual([
      ["visitor", "What is this?"],
      ["bot", "A chat widget."],
    ]);
    // Compared in SQL: a JS Date only has millisecond precision.
    const { later } = await one<{ later: boolean }>(
      `select (select created_at from messages where conversation_id = $1 and role = 'bot')
            > (select created_at from messages where conversation_id = $1 and role = 'visitor') as later`,
      [id],
    );
    expect(later).toBe(true);
  });

  it("appends to an existing conversation of the same project", async () => {
    const id = await save(P_CHAT_A, null, "visitor_2", "one", "reply one");
    // pglite's clock ticks in milliseconds; real Postgres has microseconds and turns are far apart.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await save(P_CHAT_A, id, "visitor_2", "two", "reply two")).toBe(id);
    expect((await messages(id)).map((m) => m.body)).toEqual(["one", "reply one", "two", "reply two"]);
    expect(await count("select count(*)::int as n from conversations where id = $1", [id])).toBe(1);
  });

  it("rejects a conversation from another project with AW005 and writes nothing", async () => {
    const other = await save(P_CHAT_B, null, "visitor_x", "secret question", "secret answer");
    const before = await count("select count(*)::int as n from messages");

    await expect(save(P_CHAT_A, other, "visitor_1", "sneaky", "reply")).rejects.toMatchObject({
      code: "AW005",
      message: "conversation_not_found",
    });
    expect(await count("select count(*)::int as n from messages")).toBe(before);
    expect((await messages(other)).map((m) => m.body)).toEqual(["secret question", "secret answer"]);
  });

  it("rejects an unknown conversation id with AW005", async () => {
    await expect(save(P_CHAT_A, NO_SUCH, "visitor_1", "x", "y")).rejects.toMatchObject({ code: "AW005" });
  });

  it("fails for an unknown project when starting a conversation, and writes nothing", async () => {
    const before = await count("select count(*)::int as n from conversations");
    await expect(save(NO_SUCH, null, "visitor_1", "x", "y")).rejects.toMatchObject({ code: "23503" });
    expect(await count("select count(*)::int as n from conversations")).toBe(before);
  });
});

describe("match_chunks", () => {
  const match = (projectId: string, embedding: string, n: number) =>
    queryAs<{ id: string; source_id: string; content: string; similarity: number }>(
      db,
      SERVICE,
      "select * from match_chunks($1, $2::extensions.vector, $3)",
      [projectId, embedding, n],
    );

  const SOURCES = {
    ready: "00000000-0000-4000-8000-00000000c001",
    processing: "00000000-0000-4000-8000-00000000c002",
    failed: "00000000-0000-4000-8000-00000000c003",
    uploading: "00000000-0000-4000-8000-00000000c004",
    otherReady: "00000000-0000-4000-8000-00000000c005",
  };

  beforeAll(async () => {
    const source = (id: string, projectId: string, status: string) =>
      db.exec(`insert into knowledge_sources (id, project_id, title, type, status) values ('${id}', '${projectId}', '${status}', 'text', '${status}')`);
    await source(SOURCES.ready, P_MATCH_A, "ready");
    await source(SOURCES.processing, P_MATCH_A, "processing");
    await source(SOURCES.failed, P_MATCH_A, "failed");
    await source(SOURCES.uploading, P_MATCH_A, "uploading");
    await source(SOURCES.otherReady, P_MATCH_B, "ready");

    const chunk = (projectId: string, sourceId: string, content: string, embedding: string) =>
      db.query("insert into knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4::extensions.vector)", [
        projectId,
        sourceId,
        content,
        embedding,
      ]);
    // The query vector is e0. Cosine similarity: e0 = 1, e0+e1 = 0.707, e1+e2 = 0 side.
    await chunk(P_MATCH_A, SOURCES.ready, "exact", vec({ 0: 1 }));
    await chunk(P_MATCH_A, SOURCES.ready, "close", vec({ 0: 1, 1: 1 }));
    await chunk(P_MATCH_A, SOURCES.ready, "far", vec({ 1: 1, 2: 1 }));
    await chunk(P_MATCH_A, SOURCES.processing, "processing source, exact", vec({ 0: 1 }));
    await chunk(P_MATCH_A, SOURCES.failed, "failed source, exact", vec({ 0: 1 }));
    await chunk(P_MATCH_A, SOURCES.uploading, "uploading source, exact", vec({ 0: 1 }));
    await chunk(P_MATCH_B, SOURCES.otherReady, "other project, exact", vec({ 0: 1 }));
  });

  it("returns the closest chunks first, with cosine similarity", async () => {
    const rows = await match(P_MATCH_A, vec({ 0: 1 }), 5);
    expect(rows.map((r) => r.content)).toEqual(["exact", "close", "far"]);
    expect(rows[0]!.similarity).toBeCloseTo(1, 5);
    expect(rows[1]!.similarity).toBeCloseTo(Math.SQRT1_2, 3);
    expect(rows[2]!.similarity).toBeCloseTo(0, 3);
    for (const r of rows) expect(r.source_id).toBe(SOURCES.ready);
  });

  it("never returns another project's chunks, even when they match exactly", async () => {
    const contents = (await match(P_MATCH_A, vec({ 0: 1 }), 50)).map((r) => r.content);
    expect(contents).not.toContain("other project, exact");
    expect((await match(P_MATCH_B, vec({ 0: 1 }), 50)).map((r) => r.content)).toEqual(["other project, exact"]);
  });

  it("never returns chunks of a source that is processing, failed or uploading", async () => {
    const contents = (await match(P_MATCH_A, vec({ 0: 1 }), 50)).map((r) => r.content);
    expect(contents.filter((c) => /processing|failed|uploading/.test(c))).toEqual([]);
  });

  it("returns at most p_count rows", async () => {
    expect(await match(P_MATCH_A, vec({ 0: 1 }), 2)).toHaveLength(2);
    expect(await match(P_MATCH_A, vec({ 0: 1 }), 1)).toHaveLength(1);
  });

  it("returns nothing for a project with no ready chunks, and rejects a bad count", async () => {
    expect(await match(P1, vec({ 0: 1 }), 5)).toEqual([]);
    await expect(match(P_MATCH_A, vec({ 0: 1 }), 0)).rejects.toThrow(/p_count must be at least 1/);
  });

  it("picks up a source once it becomes ready", async () => {
    await db.exec(`update knowledge_sources set status = 'ready' where id = '${SOURCES.processing}'`);
    expect((await match(P_MATCH_A, vec({ 0: 1 }), 50)).map((r) => r.content)).toContain("processing source, exact");
    await db.exec(`update knowledge_sources set status = 'processing' where id = '${SOURCES.processing}'`);
  });
});

describe("access", () => {
  const SIGNATURES = [
    "public.reserve_knowledge_source(uuid, text, text, integer)",
    "public.consume_message(uuid, integer)",
    "public.save_chat_turn(uuid, uuid, text, text, text)",
    "public.match_chunks(uuid, extensions.vector, integer)",
  ];

  const CALLS: [string, unknown[]][] = [
    ["select * from reserve_knowledge_source($1, 'Hack', 'text', 99)", [P1]],
    ["select consume_message($1, 99)", [P1]],
    ["select save_chat_turn($1, null, 'v', 'hack', 'hack')", [P1]],
    ["select * from match_chunks($1, $2::extensions.vector, 5)", [P_MATCH_A, vec({ 0: 1 })]],
  ];

  it("are SECURITY INVOKER with an empty search_path", async () => {
    const rows = await row<{ proname: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select proname, prosecdef, proconfig from pg_proc
       where proname in ('reserve_knowledge_source', 'consume_message', 'save_chat_turn', 'match_chunks')`,
    );
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.prosecdef, r.proname).toBe(false);
      expect(r.proconfig, r.proname).toContain('search_path=""');
    }
  });

  it("are executable by service_role only", async () => {
    for (const signature of SIGNATURES) {
      for (const [role, expected] of [
        ["service_role", true],
        ["anon", false],
        ["authenticated", false],
        ["public", false],
      ] as const) {
        const { ok } = await one<{ ok: boolean }>("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, signature]);
        expect(ok, `${role} ${signature}`).toBe(expected);
      }
    }
  });

  it("deny anon and the owner when they call them, and change nothing", async () => {
    const sources = await count("select count(*)::int as n from knowledge_sources");
    const used = (await usage(P1)).messages_used;
    const conversations = await count("select count(*)::int as n from conversations");

    for (const [sql, params] of CALLS) {
      await expect(queryAs(db, ANON, sql, params), `anon: ${sql}`).rejects.toThrow(/permission denied/);
      await expect(queryAs(db, OWNER, sql, params), `owner: ${sql}`).rejects.toThrow(/permission denied/);
      await expect(execAs(db, OWNER, sql, params), `owner exec: ${sql}`).rejects.toThrow(/permission denied/);
    }

    expect(await count("select count(*)::int as n from knowledge_sources")).toBe(sources);
    expect((await usage(P1)).messages_used).toBe(used);
    expect(await count("select count(*)::int as n from conversations")).toBe(conversations);
  });
});

describe("match_chunks with a crowded index", () => {
  // Another project holds many chunks closer to the question than any of this project's.
  // An approximate index search over all projects would fill its candidate list with the other
  // project's chunks and then filter them out, leaving this project short. match_chunks ranks the
  // project's own ready chunks exactly, so it still gets its p_count, best first.
  const SMALL = "00000000-0000-4000-8000-0000000000d1";
  const BIG = "00000000-0000-4000-8000-0000000000d2";
  const SMALL_SOURCE = "00000000-0000-4000-8000-00000000d101";
  const BIG_SOURCE = "00000000-0000-4000-8000-00000000d201";
  const QUERY = vec({ 0: 1 });

  let iso: PGlite;

  const match = (projectId: string, n = 5) =>
    queryAs<{ content: string; source_id: string; similarity: number }>(
      iso,
      SERVICE,
      "select * from match_chunks($1, $2::extensions.vector, $3)",
      [projectId, QUERY, n],
    );

  beforeAll(async () => {
    iso = await createSupabasePglite();
    await iso.exec(`
      insert into accounts (clerk_user_id) values ('o_small'), ('o_big');
      insert into projects (id, owner_id, name, public_key) values
        ('${SMALL}', 'o_small', 'small', 'pk_small'), ('${BIG}', 'o_big', 'big', 'pk_big');
      insert into knowledge_sources (id, project_id, title, type, status) values
        ('${SMALL_SOURCE}', '${SMALL}', 'small', 'text', 'ready'), ('${BIG_SOURCE}', '${BIG}', 'big', 'text', 'ready');
    `);
    // The big project: 400 distinct chunks, all almost exactly the question's direction.
    const near = Array.from({ length: 400 }, (_, g) => vec({ 0: 1, [10 + (g % 200)]: 0.02 + (g % 7) * 0.003 }));
    await iso.query(
      `insert into knowledge_chunks (project_id, source_id, content, embedding)
       select $1, $2, 'big ' || t.g, t.v::extensions.vector from unnest($3::text[]) with ordinality as t(v, g)`,
      [BIG, BIG_SOURCE, near],
    );
    // The small project: 5 chunks that are all farther from the question, in a known order (1 is the closest).
    for (let i = 1; i <= 5; i++) {
      await iso.query(
        "insert into knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4::extensions.vector)",
        [SMALL, SMALL_SOURCE, `small ${i}`, vec({ 0: 1, 1: i * 0.3 })],
      );
    }
  });

  afterAll(async () => {
    await iso.close();
  });

  it("gives the small project its 5 chunks, best first, none of the big project's", async () => {
    const rows = await match(SMALL);
    expect(rows.map((r) => r.content)).toEqual(["small 1", "small 2", "small 3", "small 4", "small 5"]);
    for (const r of rows) expect(r.source_id).toBe(SMALL_SOURCE);
    const similarities = rows.map((r) => r.similarity);
    expect(similarities).toEqual([...similarities].sort((a, b) => b - a));
    expect(similarities[0]).toBeCloseTo(1 / Math.sqrt(1 + 0.09), 4);
  });

  it("gives the same result when the planner is steered toward index scans", async () => {
    await iso.exec("set enable_seqscan = off; set enable_bitmapscan = off");
    expect((await match(SMALL)).map((r) => r.content)).toEqual(["small 1", "small 2", "small 3", "small 4", "small 5"]);
    await iso.exec("reset enable_seqscan; reset enable_bitmapscan");
  });

  it("still serves the big project, best first", async () => {
    const rows = await match(BIG);
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.similarity).toBeGreaterThan(0.99);
    const similarities = rows.map((r) => r.similarity);
    expect(similarities).toEqual([...similarities].sort((a, b) => b - a));
  });

  it("ranks the project's own chunks without the HNSW index or any hnsw setting", async () => {
    const { proconfig } = await one<{ proconfig: string[] }>("select proconfig from pg_proc where proname = 'match_chunks'");
    expect(proconfig).toEqual(['search_path=""']);
    const { src } = await one<{ src: string }>(
      "select pg_get_functiondef('public.match_chunks(uuid,extensions.vector,integer)'::regprocedure) as src",
    );
    expect(src).toMatch(/with scoped as materialized/);
    expect(src).toMatch(/c\.project_id = p_project_id/);
    expect(src).toMatch(/s\.status = 'ready'/);
    expect(src).not.toMatch(/hnsw\./);
  });

  it("has an index that starts with project_id, so the project's chunks are found without scanning the table", async () => {
    const { def } = await one<{ def: string }>(
      "select indexdef as def from pg_indexes where tablename = 'knowledge_chunks' and indexname = 'knowledge_chunks_project_id_idx'",
    );
    expect(def).toMatch(/\(project_id\)/);
  });
});
