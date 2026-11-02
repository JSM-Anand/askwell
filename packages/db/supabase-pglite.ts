import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export const API_ROLES = ["anon", "authenticated", "service_role"] as const;
export type ApiRole = (typeof API_ROLES)[number];

export type RoleContext = {
  role: ApiRole;
  /** JWT claims PostgREST would put in `request.jwt.claims`, e.g. `{ sub: "user_1" }`. */
  claims?: Record<string, unknown>;
};

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

// What a Supabase project has before our migrations run: the three API roles,
// auth.jwt(), the extensions schema, and default privileges that give every API
// role ALL on new public tables and functions. Tests prove the migration takes
// those back.
const SUPABASE_STUB = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  create schema auth;

  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  grant execute on function auth.jwt() to anon, authenticated, service_role;

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** Starts an in-memory Postgres with pgvector and the Supabase stub. */
export async function createSupabasePglite(options: { migrate?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);
  if (options.migrate ?? true) {
    await applyMigrations(db);
  }
  return db;
}

/** Applies every file in supabase/migrations, in filename order. */
export async function applyMigrations(db: PGlite): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(`${MIGRATIONS_DIR}${file}`, "utf8"));
  }
  return files;
}

/**
 * Runs `fn` in a transaction as an API role with the given JWT claims, the way
 * PostgREST does. Commits when `fn` resolves; rolls back when it throws.
 */
export async function runAs<T>(
  db: PGlite,
  { role, claims = {} }: RoleContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

/** One statement as an API role; returns the rows. */
export async function queryAs<Row extends object = Record<string, unknown>>(
  db: PGlite,
  context: RoleContext,
  sql: string,
  params: unknown[] = [],
): Promise<Row[]> {
  return runAs(db, context, async (tx) => (await tx.query<Row>(sql, params)).rows);
}

/** One statement as an API role; returns how many rows it changed. */
export async function execAs(
  db: PGlite,
  context: RoleContext,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  return runAs(db, context, async (tx) => (await tx.query(sql, params)).affectedRows ?? 0);
}
