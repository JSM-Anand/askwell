/** `notice` is a message from the panel itself (a friendly error), not from the bot. */
export type ChatMessage = { id: number; from: "visitor" | "bot" | "notice"; text: string };
export type ChatState = { messages: ChatMessage[]; typing: boolean };
export type ChatAction = { type: "send"; text: string } | { type: "reply"; text: string } | { type: "error"; text: string };

export const initialChat: ChatState = { messages: [], typing: false };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const from = { send: "visitor", reply: "bot", error: "notice" } as const;
  const message: ChatMessage = { id: state.messages.length, from: from[action.type], text: action.text };
  return { messages: [...state.messages, message], typing: action.type === "send" };
}

export const canSend = (draft: string, typing: boolean): boolean => !typing && draft.trim().length > 0;
