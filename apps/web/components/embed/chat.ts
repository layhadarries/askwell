import { MAX_MESSAGE_LENGTH, MOCK_REPLY } from '@askwell/shared';

export interface ChatMessage {
  id: number;
  role: 'visitor' | 'bot';
  text: string;
}

export interface ChatState {
  messages: ChatMessage[];
  typing: boolean;
}

export const TYPING_MS = 800;

/** Trimmed message, or null if empty or too long. */
export function cleanMessage(input: string): string | null {
  const text = input.trim();
  return text && text.length <= MAX_MESSAGE_LENGTH ? text : null;
}

/** Phase 2: no network. Replies with MOCK_REPLY after the typing delay. */
export function mockReply(_message: string, wait = TYPING_MS): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve(MOCK_REPLY), wait));
}

/**
 * Chat state machine, kept apart from React so it can be tested directly.
 * `onChange` gets each new state.
 */
export function createChat(
  onChange: (state: ChatState) => void,
  reply: (message: string) => Promise<string> = mockReply,
) {
  let state: ChatState = { messages: [], typing: false };
  let nextId = 1;
  const set = (s: ChatState) => {
    state = s;
    onChange(state);
  };

  return {
    get state() {
      return state;
    },
    /** Returns false if the message was rejected (empty, too long, or busy). */
    async send(input: string): Promise<boolean> {
      const text = cleanMessage(input);
      if (!text || state.typing) return false;
      set({
        messages: [...state.messages, { id: nextId++, role: 'visitor', text }],
        typing: true,
      });
      let answer: string;
      try {
        answer = await reply(text);
      } catch {
        answer = 'Sorry, something went wrong. Please try again.';
      }
      set({ messages: [...state.messages, { id: nextId++, role: 'bot', text: answer }], typing: false });
      return true;
    },
  };
}
