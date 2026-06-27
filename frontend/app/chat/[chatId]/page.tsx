"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import SettingsModal from "@/components/SettingsModal";
import ShareModal from "@/components/ShareModal";
import { useAuth } from "@/context/AuthContext";
import { useChatStore } from "@/store/chatStore";
import { useKeepAlive } from "@/hooks/useKeepAlive";

export default function ChatIdPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params?.chatId as string;

  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const chats          = useChatStore((s) => s.chats);
  const activeChatId   = useChatStore((s) => s.activeChatId);
  const messages       = useChatStore((s) => s.messages);
  const streamingState = useChatStore((s) => s.streamingState);
  const error          = useChatStore((s) => s.error);

  const loadChats    = useChatStore((s) => s.loadChats);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const selectChat   = useChatStore((s) => s.selectChat);
  const newChat      = useChatStore((s) => s.newChat);
  const deleteChat   = useChatStore((s) => s.deleteChat);
  const sendMessage  = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [shareTarget,      setShareTarget]       = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebar,    setMobileSidebar]    = useState(false);

  // Prevent duplicate init and redirect loops
  const didInit       = useRef(false);
  const chatsLoaded   = useRef(false);
  const currentToken  = useRef("");

  useKeepAlive(!!token);

  // Load chats once per token value (not on every render)
  useEffect(() => {
    if (!token || token === currentToken.current) return;
    currentToken.current = token;
    chatsLoaded.current  = false;
    loadChats(token);
    chatsLoaded.current = true;
  }, [token, loadChats]);

  // Restore this specific chat from URL — run once on mount
  useEffect(() => {
    if (!token || !chatId || didInit.current) return;
    didInit.current = true;
    selectChat(chatId, false);
    loadMessages(token, chatId);
  }, [token, chatId, selectChat, loadMessages]);

  // Navigate if the store switches to a DIFFERENT chat (e.g. sidebar click)
  // Guard: only navigate when the change was intentional (not from our own init)
  useEffect(() => {
    if (!activeChatId) return;
    if (activeChatId === chatId) return;
    // A different chat was selected via sidebar — navigate to it
    router.push(`/chat/${activeChatId}`);
  }, [activeChatId, chatId, router]);

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
    if (id === chatId) router.push("/chat");
  };

  const handleSend = (text: string, docContent?: string, docName?: string) =>
    sendMessage(token, text, docContent, docName);

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
