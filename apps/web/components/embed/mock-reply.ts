export const MOCK_REPLY = "Thanks! Real answers arrive soon.";
export const TYPING_MS = 1000;

/** Fake reply, no network. Phase 3 replaces this one function with a call to the real chat route. */
export function getReply(): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve(MOCK_REPLY), TYPING_MS));
}
