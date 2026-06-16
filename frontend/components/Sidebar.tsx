"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MessageSquare, Trash2, Settings, LogOut,
  ChevronLeft, ChevronRight, Sparkles, Zap
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Chat } from "@/types";
import clsx from "clsx";

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, onOpenSettings,
}: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const W_OPEN = 256;
  const W_COLLAPSED = 60;

  return (
    <motion.aside
      animate={{ width: collapsed ? W_COLLAPSED : W_OPEN }}
      transition={{ duration: 0.26, ease: [0.4, 0, 0.2, 1] }}
      style={{
        width: collapsed ? W_COLLAPSED : W_OPEN,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "rgba(10,10,14,0.97)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center gap-2.5 px-3 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)", minHeight: 60 }}
      >
        {/* Logo mark */}
        <div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>

        {/* App name — only when expanded */}
        {!collapsed && (
          <span className="font-bold text-white text-base tracking-tight flex-1 truncate">
            Penda
          </span>
        )}

        {/* Collapse toggle — inside header, no absolute positioning */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            "flex-shrink-0 p-1.5 rounded-lg text-zinc-500",
            "hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-150",
            collapsed && "mx-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* ── New Chat Button ── */}
      <div className="px-2.5 pt-3 pb-2">
        <button
          id="new-chat-btn"
          onClick={onNewChat}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
            "bg-penda-600/20 text-penda-300 border border-penda-500/20",
            "hover:bg-penda-600/30 hover:border-penda-500/40 hover:text-penda-200",
            "transition-all duration-200 active:scale-[0.98]",
            collapsed && "justify-center px-0"
          )}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* ── Chat List ── */}
      <div className="flex-1 overflow-y-auto px-2 py-1" style={{ minHeight: 0 }}>
        {!collapsed && chats.length > 0 && (
          <p className="px-2 py-1.5 text-xs font-semibold text-zinc-600 uppercase tracking-widest">
            Recent
          </p>
        )}

        <div className="flex flex-col gap-0.5">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="relative group"
              onMouseEnter={() => setHoveredId(chat.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                id={`chat-${chat.id}`}
                onClick={() => onSelectChat(chat.id)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left",
                  "transition-all duration-150",
                  activeChatId === chat.id
                    ? "bg-penda-600/20 text-white border border-penda-500/25"
                    : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200",
                  collapsed && "justify-center px-0"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500" />
                {!collapsed && (
                  <span className="truncate flex-1">{chat.title}</span>
                )}
              </button>

              {/* Delete button — only when not collapsed and hovered */}
              {!collapsed && hoveredId === chat.id && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg
                             text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                  aria-label="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!collapsed && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-8 h-8 text-zinc-700 mb-2" />
            <p className="text-zinc-600 text-xs">No chats yet</p>
          </div>
        )}
      </div>

      {/* ── Bottom: Token bar + Settings + User ── */}
      <div className="border-t px-2.5 py-3 flex flex-col gap-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        {/* Trial usage */}
        {!collapsed && profile && !profile.has_byok && (
          <div className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 mb-1">
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-zinc-500">Trial Tokens</span>
              <span className="text-xs text-zinc-400">
                {profile.trial_tokens_used.toLocaleString()} / {profile.trial_token_limit.toLocaleString()}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (profile.trial_tokens_used / profile.trial_token_limit) * 100)}%`,
                  background: "linear-gradient(90deg, #7c3aed, #4f46e5)",
                }}
              />
            </div>
          </div>
        )}

        {/* BYOK badge */}
        {!collapsed && profile?.has_byok && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-1">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">BYOK Active</span>
          </div>
        )}

        {/* Settings */}
        <button
          id="open-settings-btn"
          onClick={onOpenSettings}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
            "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>

        {/* User / sign out */}
        <button
          id="logout-btn"
          onClick={signOut}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
            "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-all",
            collapsed && "justify-center px-0"
          )}
          title="Sign out"
        >
          <div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          >
            {(user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs text-zinc-300 truncate">{profile?.display_name ?? user?.email}</p>
              <p className="text-xs text-zinc-600 flex items-center gap-1">
                <LogOut className="w-3 h-3" /> Sign out
              </p>
            </div>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
