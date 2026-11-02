// A small in-memory stand-in for the parts of Supabase the knowledge routes use (the
// reserve_knowledge_source function, the knowledge_sources table and the `knowledge` bucket),
// so the tests check real state: what was claimed, what was deleted, what is left in Storage.
// Test support only: nothing in the app imports this file.

export type FakeSource = {
  id: string;
  project_id: string;
  title: string;
  type: string;
  status: string;
  storage_key: string | null;
  created_at: string;
};

type Failure = { code?: string; message: string };

export type FakeState = {
  projects: Set<string>;
  sources: FakeSource[];
  files: Map<string, Blob>;
  log: string[];
  rpcCalls: Record<string, unknown>[];
  buckets: string[];
  /** Make a call fail: "download", "remove", "sign", "select" or "delete" (a source row). */
  fail: Partial<Record<"download" | "remove" | "sign" | "select" | "delete", Failure>> & {
    /** Make every update that sets this status fail. */
    updateTo?: { status: string; failure: Failure };
  };
};

const HOUR = 60 * 60 * 1000;

class Query implements PromiseLike<{ data: unknown; error: Failure | null }> {
  private action: "select" | "update" | "delete" = "select";
  private patch: Partial<FakeSource> = {};
  private filters: ((row: FakeSource) => boolean)[] = [];

  constructor(private state: FakeState) {}

  select() {
    return this;
  }
  update(patch: Partial<FakeSource>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(column: keyof FakeSource, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  lt(column: keyof FakeSource, value: string) {
    this.filters.push((row) => String(row[column]) < value);
    return this;
  }
  gte(column: keyof FakeSource, value: string) {
    this.filters.push((row) => String(row[column]) >= value);
    return this;
  }
  not(column: keyof FakeSource, _operator: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  private run(): { data: FakeSource[]; error: Failure | null } {
    const matches = this.state.sources.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.action === "select") {
      if (this.state.fail.select) return { data: [], error: this.state.fail.select };
      return { data: matches.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "update") {
      const blocked = this.state.fail.updateTo;
      if (blocked && this.patch.status === blocked.status) return { data: [], error: blocked.failure };
      this.state.log.push(`update ${JSON.stringify(this.patch)}`);
      for (const row of matches) Object.assign(row, this.patch);
      return { data: matches.map((row) => ({ ...row })), error: null };
    }
    if (this.state.fail.delete) return { data: [], error: this.state.fail.delete };
    this.state.log.push("delete source");
    this.state.sources = this.state.sources.filter((row) => !matches.includes(row));
    return { data: matches, error: null };
  }

  async maybeSingle() {
    const { data, error } = this.run();
    return { data: data[0] ?? null, error };
  }
  then<R1, R2>(
    onfulfilled?: (value: { data: unknown; error: Failure | null }) => R1 | PromiseLike<R1>,
    onrejected?: (reason: unknown) => R2 | PromiseLike<R2>,
  ) {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(projects: string[] = []) {
  const state: FakeState = { projects: new Set(projects), sources: [], files: new Map(), log: [], rpcCalls: [], buckets: [], fail: {} };

  const client = {
    from: (table: string) => {
      if (table !== "knowledge_sources") throw new Error(`Unexpected table ${table}`);
      return new Query(state);
    },

    /** reserve_knowledge_source, with the same rules as the SQL function. */
    rpc: async (name: string, args: { p_project_id: string; p_title: string; p_type: string; p_max_sources: number }) => {
      if (name !== "reserve_knowledge_source") throw new Error(`Unexpected function ${name}`);
      state.rpcCalls.push(args);
      if (!state.projects.has(args.p_project_id)) return { data: null, error: { code: "AW004", message: "project_not_found" } };
      const cutoff = new Date(Date.now() - 2 * HOUR).toISOString();
      state.sources = state.sources.filter(
        (s) => !(s.project_id === args.p_project_id && s.status === "uploading" && s.created_at < cutoff),
      );
      if (state.sources.filter((s) => s.project_id === args.p_project_id).length >= args.p_max_sources) {
        return { data: null, error: { code: "AW003", message: "source_limit_reached" } };
      }
      const id = crypto.randomUUID();
      const isText = args.p_type === "text";
      const row: FakeSource = {
        id,
        project_id: args.p_project_id,
        title: args.p_title,
        type: args.p_type,
        storage_key: isText ? null : `${args.p_project_id}/${id}.${args.p_type}`,
        status: isText ? "processing" : "uploading",
        created_at: new Date().toISOString(),
      };
      state.sources.push(row);
      return { data: { ...row }, error: null };
    },

    storage: {
      from: (bucket: string) => {
        state.buckets.push(bucket);
        return {
          createSignedUploadUrl: async (path: string) => {
            if (state.fail.sign) return { data: null, error: state.fail.sign };
            return { data: { signedUrl: `https://storage.example/upload/${path}?token=one-time`, token: "one-time", path }, error: null };
          },
          download: async (path: string) => {
            if (state.fail.download) return { data: null, error: state.fail.download };
            const file = state.files.get(path);
            return file ? { data: file, error: null } : { data: null, error: { message: "Object not found" } };
          },
          remove: async (paths: string[]) => {
            state.log.push(`remove ${paths.join(",")}`);
            if (state.fail.remove) return { data: null, error: state.fail.remove };
            for (const path of paths) state.files.delete(path);
            return { data: [], error: null };
          },
        };
      },
    },
  };

  /** Adds a source (and its file) as the upload-url route would have left it. */
  const addSource = (source: Partial<FakeSource> & { project_id: string }, file?: Blob | string | Uint8Array): FakeSource => {
    const id = source.id ?? crypto.randomUUID();
    const type = source.type ?? "txt";
    const row: FakeSource = {
      id,
      title: "Doc",
      type,
      status: "uploading",
      storage_key: type === "text" ? null : `${source.project_id}/${id}.${type}`,
      created_at: new Date().toISOString(),
      ...source,
    };
    state.sources.push(row);
    const blobLike = typeof file === "object" && file !== null && "arrayBuffer" in file;
    if (file !== undefined && row.storage_key) state.files.set(row.storage_key, blobLike ? (file as Blob) : new Blob([file as BlobPart]));
    return row;
  };

  return { state, client, addSource };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
