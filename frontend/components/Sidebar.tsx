"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MessageSquare, Trash2, Settings, LogOut,
  ChevronLeft, ChevronRight, Sparkles, Zap, Share2, Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Chat } from "@/types";
import Link from "next/link";
import clsx from "clsx";

/* ── Spring presets ────────────────────────────────────────── */
const SPRING_SLIDE  = { type: "spring" as const, stiffness: 280, damping: 28, mass: 1.0 };
const SPRING_POP    = { type: "spring" as const, stiffness: 360, damping: 20, mass: 0.75 };

const W_OPEN      = 256;
const W_COLLAPSED = 60;

interface SidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  onOpenSettings: () => void;
  onShareChat?: () => void;
}

export default function Sidebar({
  chats, activeChatId, onSelectChat, onNewChat, onDeleteChat, onOpenSettings, onShareChat,
}: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const [collapsed,  setCollapsed]  = useState(false);
  const [hoveredId,  setHoveredId]  = useState<string | null>(null);

  const usagePct = profile && !profile.has_byok
    ? Math.min(100, (profile.trial_tokens_used / profile.trial_token_limit) * 100)
    : 0;
  const usageColor = usagePct > 85 ? "#ef4444" : usagePct > 65 ? "#f59e0b" : "#7c3aed";

  return (
    <motion.aside
      animate={{ width: collapsed ? W_COLLAPSED : W_OPEN }}
      transition={SPRING_SLIDE}
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
      className="glass-strong"
    >
      {/* Ambient purple glow */}
      <div
        className="absolute top-0 left-0 w-40 h-40 rounded-full opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(124,58,237,0.5) 0%, transparent 70%)",
          filter: "blur(30px)",
          transform: "translate(-40%, -40%)",
        }}
        aria-hidden="true"
      />

      {/* ── Header ── */}
      <div
        className="flex items-center gap-2.5 px-3 py-4 border-b"
        style={{ borderColor: "rgba(255,255,255,0.06)", minHeight: 60 }}
      >
        {/* Logo mark */}
        <motion.div
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          whileHover={{ scale: 1.1, rotate: 8, boxShadow: "0 0 18px rgba(124,58,237,0.6)" }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING_POP}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </motion.div>

        {/* App name */}
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="font-bold text-white text-base tracking-tight flex-1 truncate"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={SPRING_POP}
            >
              Penda
            </motion.span>
          )}
        </AnimatePresence>

        {/* Collapse toggle */}
        <motion.button
          onClick={() => setCollapsed(!collapsed)}
          whileHover={{ scale: 1.1, backgroundColor: "rgba(39,39,42,0.9)" }}
          whileTap={{ scale: 0.88 }}
          transition={SPRING_POP}
          className={clsx(
            "flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300",
            "transition-colors duration-150",
            collapsed && "mx-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={SPRING_SLIDE}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />}
          </motion.div>
        </motion.button>
      </div>

      {/* ── New Chat Button ── */}
      <div className="px-2.5 pt-3 pb-2">
        <motion.button
          id="new-chat-btn"
          onClick={onNewChat}
          whileHover={{ scale: 1.02, backgroundColor: "rgba(124,58,237,0.25)" }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_POP}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium",
            "bg-penda-600/15 text-penda-300 border border-penda-500/20",
            "hover:border-penda-500/40 hover:text-penda-200",
            "transition-colors duration-200",
            collapsed && "justify-center px-0"
          )}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={SPRING_SLIDE}
                style={{ overflow: "hidden", whiteSpace: "nowrap" }}
              >
                New Chat
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Chat List ── */}
      <div className="flex-1 overflow-y-auto px-2 py-1" style={{ minHeight: 0 }}>
        <AnimatePresence>
          {!collapsed && chats.length > 0 && (
            <motion.p
              className="px-2 py-1.5 text-xs font-semibold text-zinc-600 uppercase tracking-widest"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Recent
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-0.5">
          {chats.map((chat, idx) => {
            const isActive = activeChatId === chat.id;
            return (
              <motion.div
                key={chat.id}
                className="relative group"
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...SPRING_POP, delay: idx * 0.025 }}
              >
                <motion.button
                  id={`chat-${chat.id}`}
                  onClick={() => onSelectChat(chat.id)}
                  whileHover={{ x: collapsed ? 0 : 2 }}
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING_POP}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left",
                    "transition-colors duration-150",
                    isActive
                      ? "bg-penda-600/20 text-white border border-penda-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                      : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200 border border-transparent",
                    collapsed && "justify-center px-0"
                  )}
                >
                  <MessageSquare
                    className={clsx(
                      "w-3.5 h-3.5 flex-shrink-0 transition-colors",
                      isActive ? "text-penda-400" : "text-zinc-600"
                    )}
                  />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        className="truncate flex-1 sidebar-item-label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                      >
                        {chat.title}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>

                {/* Delete button */}
                <AnimatePresence>
                  {!collapsed && hoveredId === chat.id && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.7, x: 4 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.7, x: 4 }}
                      transition={SPRING_POP}
                      whileTap={{ scale: 0.85 }}
                      className="
                        absolute right-2 top-1/2 -translate-y-1/2
                        p-1.5 rounded-lg text-zinc-600
                        hover:text-red-400 hover:bg-red-500/10
                        transition-colors
                      "
                      onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
                      aria-label="Delete chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state */}
        <AnimatePresence>
          {!collapsed && chats.length === 0 && (
            <motion.div
              className="flex flex-col items-center justify-center py-14 text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING_POP}
            >
              <MessageSquare className="w-8 h-8 text-zinc-800 mb-3" />
              <p className="text-zinc-600 text-xs">No conversations yet</p>
              <p className="text-zinc-700 text-[11px] mt-0.5">Start a new chat above</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom: Token bar + Settings + User ── */}
      <div
        className="border-t px-2.5 py-3 flex flex-col gap-1"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Trial token bar */}
        <AnimatePresence>
          {!collapsed && profile && !profile.has_byok && (
            <motion.div
              className="px-3 py-2.5 rounded-xl mb-1 border"
              style={{
                background: "rgba(18,18,22,0.9)",
                borderColor: "rgba(255,255,255,0.07)",
              }}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_SLIDE}
            >
              <div className="flex justify-between mb-2">
                <span className="text-xs text-zinc-500">Trial Tokens</span>
                <span className="text-xs text-zinc-400 font-mono tabular-nums">
                  {profile.trial_tokens_used.toLocaleString()} / {profile.trial_token_limit.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800/80 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${usagePct}%` }}
                  transition={{ ...SPRING_SLIDE, delay: 0.1 }}
                  style={{
                    background: `linear-gradient(90deg, ${usageColor}, ${usageColor}cc)`,
                    boxShadow: `0 0 8px ${usageColor}88`,
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BYOK badge */}
        <AnimatePresence>
          {!collapsed && profile?.has_byok && (
            <motion.div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-1 border border-emerald-500/20"
              style={{ background: "rgba(16,185,129,0.08)" }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING_POP}
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">BYOK Active</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ATS Dashboard link */}
        <Link href="/ats" className={clsx(
          "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
          "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors",
          collapsed && "justify-center px-0"
        )}>
          <Users className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                ATS Dashboard
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        {/* Share Chat button */}
        {onShareChat && activeChatId && (
          <motion.button
            id="share-chat-btn"
            onClick={onShareChat}
            whileHover={{ x: collapsed ? 0 : 2, backgroundColor: "rgba(39,39,42,0.7)" }}
            whileTap={{ scale: 0.96 }}
            transition={SPRING_POP}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
              "text-zinc-400 hover:text-zinc-200 transition-colors",
              collapsed && "justify-center px-0"
            )}
          >
            <Share2 className="w-4 h-4 flex-shrink-0" />
            <AnimatePresence>
              {!collapsed && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  Share Chat
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}

        {/* Settings */}
        <motion.button
          id="open-settings-btn"
          onClick={onOpenSettings}
          whileHover={{ x: collapsed ? 0 : 2, backgroundColor: "rgba(39,39,42,0.7)" }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_POP}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
            "text-zinc-400 hover:text-zinc-200 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* User / sign out */}
        <motion.button
          id="logout-btn"
          onClick={signOut}
          whileHover={{ x: collapsed ? 0 : 2, backgroundColor: "rgba(39,39,42,0.7)" }}
          whileTap={{ scale: 0.96 }}
          transition={SPRING_POP}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm",
            "text-zinc-400 hover:text-zinc-200 transition-colors",
            collapsed && "justify-center px-0"
          )}
          title="Sign out"
        >
          <motion.div
            className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            whileHover={{ scale: 1.1 }}
            transition={SPRING_POP}
          >
            {(user?.email?.[0] ?? "U").toUpperCase()}
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="flex-1 min-w-0 text-left"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <p className="text-xs text-zinc-300 truncate">{profile?.display_name ?? user?.email}</p>
                <p className="text-xs text-zinc-600 flex items-center gap-1">
                  <LogOut className="w-3 h-3" /> Sign out
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.aside>
  );
}
