"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  listChats, createChat, deleteChat as apiDeleteChat,
  getChatMessages, streamChat,
} from "@/lib/api";
import { Chat, Message, SSEEvent } from "@/types";

export interface StreamingState {
  isStreaming: boolean;
  activeTool: string | null;
}

export function useChat() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingState, setStreamingState] = useState<StreamingState>({ isStreaming: false, activeTool: null });
  const [error, setError] = useState<string | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);

  const loadChats = useCallback(async () => {
    if (!token) return;
    try { setChats(await listChats(token)); } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadChats(); }, [loadChats]);

  const loadMessages = useCallback(async (chatId: string) => {
    if (!token) return;
    try { setMessages(await getChatMessages(token, chatId)); } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
    else setMessages([]);
  }, [activeChatId, loadMessages]);

  const selectChat = useCallback((chatId: string) => {
    cancelStreamRef.current?.();
    setActiveChatId(chatId);
    setError(null);
  }, []);

  const newChat = useCallback(async (): Promise<string | null> => {
    if (!token) return null;
    try {
      const chatId = await createChat(token);
      await loadChats();
      setActiveChatId(chatId);
      setMessages([]);
      setError(null);
      return chatId;
    } catch { return null; }
  }, [token, loadChats]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!token) return;
    try {
      await apiDeleteChat(token, chatId);
      if (activeChatId === chatId) { setActiveChatId(null); setMessages([]); }
      await loadChats();
    } catch { /* ignore */ }
  }, [token, activeChatId, loadChats]);

  const sendMessage = useCallback(async (
    text: string,
    docContent?: string,
    docName?: string,
  ) => {
    if (!token || !text.trim() || streamingState.isStreaming) return;

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await newChat();
      if (!chatId) return;
    }

    setError(null);

    // Optimistic user message
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    // Streaming assistant placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setStreamingState({ isStreaming: true, activeTool: null });

    cancelStreamRef.current = streamChat(
      token, chatId, text,
      (event: SSEEvent) => {
        switch (event.type) {
          case "token":
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant") {
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
              }
              return updated;
            });
            break;
          case "tool_call":
            setStreamingState((prev) => ({ ...prev, activeTool: event.tool }));
            break;
          case "done":
            setStreamingState({ isStreaming: false, activeTool: null });
            loadChats();
            break;
          case "error":
            setError(event.message);
            setStreamingState({ isStreaming: false, activeTool: null });
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === "assistant" && !last.content) updated.pop();
              return updated;
            });
            break;
        }
      },
      docContent,
      docName,
    );
  }, [token, activeChatId, streamingState.isStreaming, newChat, loadChats]);

  const stopStreaming = useCallback(() => {
    cancelStreamRef.current?.();
    setStreamingState({ isStreaming: false, activeTool: null });
  }, []);

  return {
    chats, activeChatId, messages, streamingState, error,
    selectChat, newChat, deleteChat, sendMessage, stopStreaming, loadChats,
  };
}
