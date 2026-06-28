"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import SettingsModal from "@/components/SettingsModal";
import ShareModal from "@/components/ShareModal";
import { useAuth } from "@/context/AuthContext";
import { useChatStore } from "@/store/chatStore";
import { useKeepAlive } from "@/hooks/useKeepAlive";

export default function ChatPage() {
  const router = useRouter();
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const chats          = useChatStore((s) => s.chats);
  const activeChatId   = useChatStore((s) => s.activeChatId);
  const messages       = useChatStore((s) => s.messages);
  const streamingState = useChatStore((s) => s.streamingState);
  const error          = useChatStore((s) => s.error);

  const loadChats    = useChatStore((s) => s.loadChats);
  const selectChat   = useChatStore((s) => s.selectChat);
  const clearChat    = useChatStore((s) => s.clearChat);
  const newChat      = useChatStore((s) => s.newChat);
  const deleteChat   = useChatStore((s) => s.deleteChat);
  const sendMessage  = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [shareTarget,      setShareTarget]       = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar,    setMobileSidebar]    = useState(false);

  // Track whether we've already redirected to avoid loop
  const didRedirect   = useRef(false);
  const pendingChatId = useRef<string | null>(null);

  useKeepAlive(!!token);

  // Clear any stale activeChatId when landing on /chat (new chat welcome screen)
  useEffect(() => {
    clearChat();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chat list once when token is available
  useEffect(() => {
    if (token) loadChats(token);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // When a new chat is created (activeChatId appears for the first time),
  // hold the redirect until streaming is done so the first SSE response isn't killed.
  useEffect(() => {
    if (!activeChatId || didRedirect.current) return;
    // Store the chat we want to navigate to
    pendingChatId.current = activeChatId;
  }, [activeChatId]);

  // Once streaming finishes, do the redirect
  useEffect(() => {
    if (streamingState.isStreaming) return;
    if (!pendingChatId.current || didRedirect.current) return;
    didRedirect.current = true;
    router.replace(`/chat/${pendingChatId.current}`);
  }, [streamingState.isStreaming, router]);

  const handleSelectChat = (id: string) => {
    selectChat(id, false);
    router.push(`/chat/${id}`);
    setMobileSidebar(false);
  };

  const handleNewChat = async () => {
    const id = await newChat(token);
    if (id) router.push(`/chat/${id}`);
    setMobileSidebar(false);
  };

  const handleDeleteChat = async (id: string) => {
    await deleteChat(token, id);
  };

  const handleSend = async (text: string, docContent?: string, docName?: string) => {
    await sendMessage(token, text, docContent, docName);
  };

  return (
    <AuthGuard>
      <div className="flex w-screen h-screen overflow-hidden" style={{ background: "#0A0A0A" }}>
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onOpenSettings={() => setSettingsOpen(true)}
          onShareChat={(id) => setShareTarget(id ?? activeChatId)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          mobileOpen={mobileSidebar}
          onCloseMobile={() => setMobileSidebar(false)}
        />

        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
          <ChatWindow
            messages={messages}
            streamingState={streamingState}
            error={error}
            onSend={handleSend}
            onStop={stopStreaming}
            activeChatId={activeChatId}
            onOpenMobileSidebar={() => setMobileSidebar(true)}
            onOpenShare={() => setShareTarget(activeChatId)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {shareTarget && (
        <ShareModal chatId={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </AuthGuard>
  );
}
