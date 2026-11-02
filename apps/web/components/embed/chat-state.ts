export type ChatMessage = { id: number; from: "visitor" | "bot"; text: string };
export type ChatState = { messages: ChatMessage[]; typing: boolean };
export type ChatAction = { type: "send"; text: string } | { type: "reply"; text: string };

export const initialChat: ChatState = { messages: [], typing: false };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  const message: ChatMessage = {
    id: state.messages.length,
    from: action.type === "send" ? "visitor" : "bot",
    text: action.text,
  };
  return { messages: [...state.messages, message], typing: action.type === "send" };
}

export const canSend = (draft: string, typing: boolean): boolean => !typing && draft.trim().length > 0;
