"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
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
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const didMount = useRef(false);

  useKeepAlive(!!token);

  // Bootstrap: load chats when token is available
  useEffect(() => {
    if (token) loadChats(token);
  }, [token, loadChats]);

  // On mount: restore chat from URL param
  useEffect(() => {
    if (token && chatId && !didMount.current) {
      didMount.current = true;
      // Select the chat from the URL without pushing to history
      selectChat(chatId, /* updateUrl */ false);
      loadMessages(token, chatId);
    }
  }, [token, chatId, selectChat, loadMessages]);

  // Sync: if store activeChatId changes to a different chat, navigate
  useEffect(() => {
    if (activeChatId && activeChatId !== chatId) {
      router.push(`/chat/${activeChatId}`);
    }
  }, [activeChatId, chatId, router]);

  const handleSelectChat = (id: string) => {
    selectChat(id, /* updateUrl */ false);
    router.push(`/chat/${id}`);
  };

  const handleNewChat = async () => {
    const id = await newChat(token);
    if (id) router.push(`/chat/${id}`);
  };

  const handleDeleteChat = async (id: string) => {
    await deleteChat(token, id);
    if (id === chatId) router.push("/chat");
  };

  const handleSend = (text: string, docContent?: string, docName?: string) =>
    sendMessage(token, text, docContent, docName);

  return (
    <AuthGuard>
      <div
        style={{
          display: "flex",
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "#09090b",
        }}
      >
        <div className="flex-shrink-0 flex h-full absolute md:relative z-20">
          <Sidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onDeleteChat={handleDeleteChat}
            onOpenSettings={() => setSettingsOpen(true)}
            onShareChat={() => setShareModalOpen(true)}
          />
        </div>

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

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {shareModalOpen && activeChatId && (
        <ShareModal
          chatId={activeChatId}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </AuthGuard>
  );
}
