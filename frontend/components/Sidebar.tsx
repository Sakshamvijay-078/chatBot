"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MessageSquare, Trash2, Settings, LogOut,
  ChevronLeft, Share2, Users, Zap,
  MoreHorizontal, ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Chat } from "@/types";
import Link from "next/link";
import clsx from "clsx";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30, mass: 1 };
const SPRING_POP = { type: "spring" as const, stiffness: 400, damping: 25, mass: 0.7 };

const W_OPEN = 260;
const W_COLLAPSED = 56;

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
  onShareChat?: (chatId?: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

/** Tiny context menu shown on hover of a chat row */
function ChatContextMenu({
  chatId,
  onDelete,
  onShare,
  onClose,
}: {
  chatId: string;
  onDelete: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className="absolute right-1 top-7 z-50 rounded-md overflow-hidden"
      style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", minWidth: 148, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
      initial={{ opacity: 0, scale: 0.92, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={SPRING_POP}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onShare(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors"
        style={{ color: "#9A9A9A" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#2A2A2A"; e.currentTarget.style.color = "#F5F5F5"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9A9A9A"; }}
      >
        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
        Share chat
      </button>
      <div style={{ height: 1, background: "#2A2A2A" }} />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] transition-colors"
        style={{ color: "#9A9A9A" }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#f87171"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#9A9A9A"; }}
      >
        <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
        Delete chat
      </button>
    </motion.div>
  );
}

export default function Sidebar({
  chats, activeChatId, onSelectChat, onNewChat, onDeleteChat,
  onOpenSettings, onShareChat,
  collapsed, onToggleCollapsed,
  mobileOpen, onCloseMobile,
}: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const usagePct = profile && !profile.has_byok
    ? Math.min(100, (profile.trial_tokens_used / profile.trial_token_limit) * 100)
    : 0;
  const usageColor = usagePct > 85 ? "#ef4444" : usagePct > 65 ? "#f59e0b" : "#C8F31D";

  const sidebarContent = (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "#0D0D0D", borderRight: "1px solid #1F1F1F" }}>

      {/* Sparse decorative marks */}
      <span className="asterisk-mark" style={{ top: "22%", left: "78%", fontSize: 20, transform: "rotate(18deg)" }} aria-hidden>✳</span>
      <span className="asterisk-mark" style={{ top: "68%", left: "65%", fontSize: 13, transform: "rotate(-10deg)" }} aria-hidden>✳</span>

      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-3 py-3.5" style={{ borderBottom: "1px solid #1F1F1F", minHeight: 56 }}>
        <button
          onClick={collapsed ? onToggleCollapsed : undefined}
          className={collapsed ? "dotted-badge flex-shrink-0 cursor-pointer transition-colors" : "dotted-badge flex-shrink-0"}
          style={{ width: 32, height: 32 }}
          title={collapsed ? "Expand sidebar" : undefined}
          aria-label={collapsed ? "Expand sidebar" : "Penda"}
        >
          <span style={{ fontSize: 14, fontWeight: 800, color: "#C8F31D", letterSpacing: "-0.03em" }}>P</span>
        </button>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="flex-1 min-w-0"
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }}
              transition={SPRING_POP}
            >
              <p className="font-bold text-[15px] leading-tight tracking-tight" style={{ color: "#F5F5F5" }}>Penda</p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "#444" }}>AI Assistant</p>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Show collapse chevron only when expanded */}
        {!collapsed && (
          <button
            onClick={onToggleCollapsed}
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "#444" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#444")}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── New Chat ── */}
      <div className="px-2.5 pt-2.5 pb-2">
        <button
          id="new-chat-btn"
          onClick={onNewChat}
          className={clsx(
            "w-full flex items-center font-bold text-[12.5px] transition-opacity active:scale-[0.97]",
            collapsed ? "justify-center p-2 rounded-md" : "gap-2 px-3.5 py-2 rounded-full"
          )}
          style={{ background: "#C8F31D", color: "#0A0A0A" }}
        >
          <Plus className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={2.8} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }} transition={SPRING} style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
                New chat
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Chat List ── */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1" style={{ minHeight: 0 }}>
        <AnimatePresence>
          {!collapsed && chats.length > 0 && (
            <motion.p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "#444" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
              Chats
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-px">
          {chats.map((chat, idx) => {
            const isActive = activeChatId === chat.id;
            return (
              <motion.div
                key={chat.id}
                className="relative group"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING_POP, delay: idx * 0.02 }}
              >
                <button
                  id={`chat-${chat.id}`}
                  onClick={() => onSelectChat(chat.id)}
                  className={clsx(
                    "sidebar-item w-full",
                    isActive && "active",
                    collapsed && "justify-center"
                  )}
                  style={{ paddingLeft: collapsed ? 0 : undefined, paddingRight: collapsed ? 0 : undefined }}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 transition-colors"
                    style={{ color: isActive ? "#C8F31D" : "#444" }} />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span className="sidebar-item-label text-[13px]"
                        style={{ color: isActive ? "#F5F5F5" : "#888" }}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.08 }}>
                        {chat.title}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                {/* Three-dot menu — only when not collapsed */}
                {!collapsed && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
                      className="w-6 h-6 rounded-md flex items-center justify-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: "#555" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#2A2A2A"; e.currentTarget.style.color = "#F5F5F5"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#555"; }}
                      aria-label="Chat options"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <AnimatePresence>
                      {menuOpenId === chat.id && (
                        <ChatContextMenu
                          chatId={chat.id}
                          onDelete={() => onDeleteChat(chat.id)}
                          onShare={() => onShareChat?.(chat.id)}
                          onClose={() => setMenuOpenId(null)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {!collapsed && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: "#161616", border: "1px solid #2A2A2A" }}>
              <MessageSquare className="w-4 h-4" style={{ color: "#333" }} />
            </div>
            <p className="text-[12px]" style={{ color: "#444" }}>No conversations yet</p>
            <p className="text-[11px] mt-1" style={{ color: "#333" }}>Start a new chat above</p>
          </div>
        )}
      </div>

      {/* ── Bottom ── */}
      <div className="px-1.5 py-2.5 flex flex-col gap-px" style={{ borderTop: "1px solid #1F1F1F" }}>
        {/* Trial bar */}
        <AnimatePresence>
          {!collapsed && profile && !profile.has_byok && (
            <motion.div className="mx-1 px-3 py-2.5 rounded-md mb-1.5"
              style={{ background: "#161616", border: "1px solid #1F1F1F" }}
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }} transition={SPRING}>
              <div className="flex justify-between mb-1.5">
                <span className="text-[11px]" style={{ color: "#444" }}>Trial</span>
                <span className="text-[11px] font-mono" style={{ color: "#666" }}>{Math.round(usagePct)}%</span>
              </div>
              <div className="h-0.5 w-full rounded-full overflow-hidden" style={{ background: "#2A2A2A" }}>
                <motion.div className="h-full rounded-full" initial={{ width: 0 }}
                  animate={{ width: `${usagePct}%` }} transition={{ ...SPRING, delay: 0.1 }}
                  style={{ background: usageColor }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BYOK badge */}
        <AnimatePresence>
          {!collapsed && profile?.has_byok && (
            <motion.div className="mx-1 flex items-center gap-2 px-3 py-2 rounded-md mb-1"
              style={{ background: "rgba(200,243,29,0.05)", border: "1px solid rgba(200,243,29,0.15)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={SPRING_POP}>
              <Zap className="w-3 h-3" style={{ color: "#C8F31D" }} />
              <span className="text-[11px] font-medium" style={{ color: "#C8F31D" }}>BYOK Active</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ATS link */}
        <Link href="/ats" className={clsx("sidebar-item", collapsed && "justify-center")} style={{ color: "#666" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}>
          <Users className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>{!collapsed && (
            <motion.span className="sidebar-item-label text-[13px]" initial={{ opacity: 0 }}
              animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>
              ATS Dashboard
            </motion.span>
          )}</AnimatePresence>
        </Link>

        {/* Share (only when a chat is active) */}
        {onShareChat && activeChatId && (
          <button
            id="share-chat-btn"
            onClick={() => onShareChat(activeChatId)}
            className={clsx("sidebar-item", collapsed && "justify-center")}
            style={{ color: "#666" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
          >
            <Share2 className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>{!collapsed && (
              <motion.span className="sidebar-item-label text-[13px]" initial={{ opacity: 0 }}
                animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>
                Share Chat
              </motion.span>
            )}</AnimatePresence>
          </button>
        )}

        {/* Settings */}
        <button
          id="open-settings-btn"
          onClick={onOpenSettings}
          className={clsx("sidebar-item", collapsed && "justify-center")}
          style={{ color: "#666" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#666")}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>{!collapsed && (
            <motion.span className="sidebar-item-label text-[13px]" initial={{ opacity: 0 }}
              animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>
              Settings
            </motion.span>
          )}</AnimatePresence>
        </button>

        {/* User / sign out */}
        <button
          id="logout-btn"
          onClick={signOut}
          className={clsx("sidebar-item", collapsed && "justify-center")}
          style={{ color: "#666" }}
          title="Sign out"
        >
          <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold"
            style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", color: "#9A9A9A" }}>
            {(user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <AnimatePresence>{!collapsed && (
            <motion.div className="flex-1 min-w-0 text-left" initial={{ opacity: 0 }}
              animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.08 }}>
              <p className="text-[12px] truncate" style={{ color: "#888" }}>{profile?.display_name ?? user?.email}</p>
              <p className="text-[10px] flex items-center gap-1" style={{ color: "#444" }}>
                <LogOut className="w-2.5 h-2.5" /> Sign out
              </p>
            </motion.div>
          )}</AnimatePresence>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — animated width */}
      <motion.aside
        className="hidden md:flex flex-col h-full flex-shrink-0"
        animate={{ width: collapsed ? W_COLLAPSED : W_OPEN }}
        transition={SPRING}
        style={{ overflow: "hidden" }}
      >
        {sidebarContent}
      </motion.aside>

      {/* Mobile sidebar — slide-in overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgba(0,0,0,0.6)" }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={onCloseMobile}
            />
            <motion.aside
              className="fixed left-0 top-0 bottom-0 z-50 flex flex-col md:hidden"
              style={{ width: W_OPEN, overflow: "hidden" }}
              initial={{ x: -W_OPEN }} animate={{ x: 0 }} exit={{ x: -W_OPEN }}
              transition={SPRING}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
