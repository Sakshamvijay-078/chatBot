/**
 * chatStore.ts — Penda Frontend
 *
 * Growth-scope §2C — State Management: Migrates complex React state from
 * useChat.ts to Zustand. Benefits:
 *   - No unnecessary re-renders: components subscribe only to the slices they
 *     need (e.g. Sidebar only reads chats, not messages).
 *   - Global, singleton store — no prop-drilling through ChatWindow → ChatInput.
 *   - Built-in devtools support via zustand/middleware.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  listChats,
  createChat,
  deleteChat as apiDeleteChat,
  getChatMessages,
  streamChat,
} from "@/lib/api";
import { Chat, Message, SSEEvent } from "@/types";

export interface StreamingState {
  isStreaming: boolean;
  activeTool: string | null;
}

interface ChatStore {
  // ── State ────────────────────────────────────────────────────
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  streamingState: StreamingState;
  error: string | null;

  /** Raw cancel callback returned by streamChat() */
  _cancelStream: (() => void) | null;

  // ── Actions ──────────────────────────────────────────────────
  loadChats: (token: string) => Promise<void>;
  loadMessages: (token: string, chatId: string) => Promise<void>;
  selectChat: (chatId: string) => void;
  newChat: (token: string) => Promise<string | null>;
  deleteChat: (token: string, chatId: string) => Promise<void>;
  sendMessage: (
    token: string,
    text: string,
    docContent?: string,
    docName?: string,
  ) => Promise<void>;
  stopStreaming: () => void;
  clearError: () => void;
}

export const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      chats: [],
      activeChatId: null,
      messages: [],
      streamingState: { isStreaming: false, activeTool: null },
      error: null,
      _cancelStream: null,

      // ── loadChats ───────────────────────────────────────────
      loadChats: async (token) => {
        try {
          const chats = await listChats(token);
          set({ chats }, false, "loadChats");
        } catch {
          // Silently ignore — sidebar will just stay empty
        }
      },

      // ── loadMessages ────────────────────────────────────────
      loadMessages: async (token, chatId) => {
        try {
          const messages = await getChatMessages(token, chatId);
          set({ messages }, false, "loadMessages");
        } catch {
          set({ messages: [] });
        }
      },

      // ── selectChat ──────────────────────────────────────────
      selectChat: (chatId) => {
        get()._cancelStream?.();
        set({ activeChatId: chatId, error: null, _cancelStream: null }, false, "selectChat");
      },

      // ── newChat ─────────────────────────────────────────────
      newChat: async (token) => {
        try {
          const chatId = await createChat(token);
          await get().loadChats(token);
          set({ activeChatId: chatId, messages: [], error: null }, false, "newChat");
          return chatId;
        } catch {
          return null;
        }
      },

      // ── deleteChat ──────────────────────────────────────────
      deleteChat: async (token, chatId) => {
        try {
          await apiDeleteChat(token, chatId);
          const { activeChatId } = get();
          if (activeChatId === chatId) {
            set({ activeChatId: null, messages: [] });
          }
          await get().loadChats(token);
        } catch {
          // ignore
        }
      },

      // ── sendMessage ─────────────────────────────────────────
      sendMessage: async (token, text, docContent, docName) => {
        if (!token || !text.trim() || get().streamingState.isStreaming) return;

        let { activeChatId } = get();
        if (!activeChatId) {
          activeChatId = await get().newChat(token);
          if (!activeChatId) return;
        }

        set({ error: null }, false, "sendMessage/clearError");

        // Optimistic user + assistant placeholder
        set(
          (s) => ({
            messages: [
              ...s.messages,
              { role: "user" as const, content: text },
              { role: "assistant" as const, content: "" },
            ],
            streamingState: { isStreaming: true, activeTool: null },
          }),
          false,
          "sendMessage/optimistic",
        );

        const chatId = activeChatId;

        const cancel = streamChat(
          token,
          chatId,
          text,
          (event: SSEEvent) => {
            switch (event.type) {
              case "token":
                set(
                  (s) => {
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last?.role === "assistant") {
                      msgs[msgs.length - 1] = { ...last, content: last.content + event.content };
                    }
                    return { messages: msgs };
                  },
                  false,
                  "sendMessage/token",
                );
                break;

              case "tool_call":
                set(
                  (s) => ({ streamingState: { ...s.streamingState, activeTool: event.tool } }),
                  false,
                  "sendMessage/toolCall",
                );
                break;

              case "done":
                set(
                  { streamingState: { isStreaming: false, activeTool: null }, _cancelStream: null },
                  false,
                  "sendMessage/done",
                );
                get().loadChats(token);
                break;

              case "error":
                set(
                  (s) => {
                    const msgs = [...s.messages];
                    const last = msgs[msgs.length - 1];
                    if (last?.role === "assistant" && !last.content) msgs.pop();
                    return {
                      messages: msgs,
                      error: event.message,
                      streamingState: { isStreaming: false, activeTool: null },
                      _cancelStream: null,
                    };
                  },
                  false,
                  "sendMessage/error",
                );
                break;
            }
          },
          docContent,
          docName,
        );

        set({ _cancelStream: cancel }, false, "sendMessage/setCancel");
      },

      // ── stopStreaming ────────────────────────────────────────
      stopStreaming: () => {
        get()._cancelStream?.();
        set(
          { streamingState: { isStreaming: false, activeTool: null }, _cancelStream: null },
          false,
          "stopStreaming",
        );
      },

      // ── clearError ───────────────────────────────────────────
      clearError: () => set({ error: null }, false, "clearError"),
    }),
    { name: "PendaChatStore" },
  ),
);
