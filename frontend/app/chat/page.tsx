"use client";

import { useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import SettingsModal from "@/components/SettingsModal";
import { useChat } from "@/hooks/useChat";

export default function ChatPage() {
  const {
    chats,
    activeChatId,
    messages,
    streamingState,
    error,
    selectChat,
    newChat,
    deleteChat,
    sendMessage,
    stopStreaming,
  } = useChat();

  const [settingsOpen, setSettingsOpen] = useState(false);

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
            onSelectChat={selectChat}
            onNewChat={newChat}
            onDeleteChat={deleteChat}
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
            onSend={sendMessage}
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
