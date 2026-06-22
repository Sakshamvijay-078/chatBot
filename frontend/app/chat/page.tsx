"use client";

import { useState, useEffect } from "react";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import SettingsModal from "@/components/SettingsModal";
import { useAuth } from "@/context/AuthContext";
import { useChatStore } from "@/store/chatStore";
import { useKeepAlive } from "@/hooks/useKeepAlive";

export default function ChatPage() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  // §2C — Zustand store: each component subscribes only to what it needs.
  const chats        = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const messages     = useChatStore((s) => s.messages);
  const streamingState = useChatStore((s) => s.streamingState);
  const error        = useChatStore((s) => s.error);

  const loadChats    = useChatStore((s) => s.loadChats);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const selectChat   = useChatStore((s) => s.selectChat);
  const newChat      = useChatStore((s) => s.newChat);
  const deleteChat   = useChatStore((s) => s.deleteChat);
  const sendMessage  = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Keep-alive: ping the Render backend every 5 min so it never sleeps
  useKeepAlive(!!token);

  // Bootstrap: load chats when token is available
  useEffect(() => {
    if (token) loadChats(token);
  }, [token, loadChats]);

  // Load messages when active chat changes
  useEffect(() => {
    if (token && activeChatId) loadMessages(token, activeChatId);
  }, [token, activeChatId, loadMessages]);

  // Bind token into action callbacks so ChatWindow/Sidebar don't need it
  const handleSelectChat = (chatId: string) => selectChat(chatId);
  const handleNewChat    = () => newChat(token);
  const handleDeleteChat = (chatId: string) => deleteChat(token, chatId);
  const handleSend       = (text: string, docContent?: string, docName?: string) =>
    sendMessage(token, text, docContent, docName);

  return (
    <AuthGuard>
      {/*
       * LAYOUT:
       * - Root: full viewport, flex row, no overflow
       * - Sidebar: fixed narrow width (auto-collapses), never shrinks
       * - Main: flex-1, takes remaining width; internal column layout
       *   fills height and pins input at bottom
       */}
      <div
        style={{
          display: "flex",
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "#09090b",
        }}
      >
        {/* Sidebar — width is controlled internally by Framer Motion */}
        <div className="flex-shrink-0 flex h-full absolute md:relative z-20">
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* Main content area */}
        <main
          className="flex-1 flex flex-col h-full min-w-0 w-full pl-[60px] md:pl-0"
          style={{ overflow: "hidden" }}
        >
          <ChatWindow
            messages={messages}
            streamingState={streamingState}
            error={error}
            onSend={handleSend}
            onStop={stopStreaming}
          />
        </main>
      </div>

      {/* Settings modal — portaled outside the flex container */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </AuthGuard>
  );
}
