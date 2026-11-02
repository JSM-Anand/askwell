import { APP_NAME } from "@askwell/shared";

const STORAGE_KEY = `${APP_NAME.toLowerCase()}-visitor-id`;

type Store = Pick<Storage, "getItem" | "setItem">;

function newId(): string {
  // randomUUID only exists in secure contexts; the panel can be framed from a plain-http site.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Random ID kept in the iframe's localStorage and reused on later visits. */
export function getVisitorId(getStore: () => Store = () => localStorage): string {
  try {
    const store = getStore();
    const saved = store.getItem(STORAGE_KEY);
    if (saved) return saved;
    const id = newId();
    store.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return newId(); // storage blocked: an ID for this load still works
  }
}
