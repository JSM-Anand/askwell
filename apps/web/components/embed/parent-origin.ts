/** The embedding page's origin from the `origin` param, or null. Exact http(s) origins only: no paths, no `*`. */
export function parseParentOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    return isWeb && url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
}
