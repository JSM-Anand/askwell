import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  const id = setInterval(notify, 30_000);
  return () => clearInterval(id);
};
const minute = () => Math.floor(Date.now() / 60_000);
const onServer = () => null;

/**
 * The current time, or null on the server and during hydration. It re-renders when the minute changes (the
 * snapshot is the minute number), but the time returned is the real time at render, not rounded down. Rendering "5 minutes ago" on the
 * server would differ from the browser a moment later, so the first render shows the exact date and the relative
 * text takes over once the page is live; it then updates as time passes.
 */
export function useNow(): Date | null {
  const now = useSyncExternalStore(subscribe, minute, onServer);
  return now === null ? null : new Date();
}
