"use client";

import { useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, Globe, Calculator, FileText, Menu, Share2, Settings, Copy, Check } from "lucide-react";
import { useState } from "react";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import { Message } from "@/types";
import { StreamingState } from "@/store/chatStore";

const SPRING_SOFT  = { type: "spring" as const, stiffness: 180, damping: 28, mass: 1.1 };
const SPRING_ENTER = { type: "spring" as const, stiffness: 260, damping: 24, mass: 0.9 };

const SUGGESTIONS = [
  { icon: <Zap className="w-4 h-4" style={{ color: "#C8F31D" }} />,        text: "Explain quantum computing simply",          label: "Concepts"  },
  { icon: <Globe className="w-4 h-4" style={{ color: "#C8F31D" }} />,       text: "Search the web for latest AI news",         label: "Research"  },
  { icon: <Calculator className="w-4 h-4" style={{ color: "#C8F31D" }} />,  text: "Calculate compound interest for 5 years",   label: "Math"      },
  { icon: <FileText className="w-4 h-4" style={{ color: "#C8F31D" }} />,    text: "Write a professional email draft",          label: "Writing"   },
];

interface ChatWindowProps {
  messages: Message[];
  streamingState: StreamingState;
  error: string | null;
  onSend: (text: string, docContent?: string, docName?: string) => void;
  onStop: () => void;
  activeChatId: string | null;
  onOpenMobileSidebar: () => void;
  onOpenShare: () => void;
  onOpenSettings: () => void;
}

/** Copy entire conversation as plain text */
function useCopyConversation(messages: Message[]) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    const text = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role === "user" ? "You" : "Penda"}: ${m.content}`)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return { copied, copy };
}

export default function ChatWindow({
  messages, streamingState, error, onSend, onStop,
  activeChatId, onOpenMobileSidebar, onOpenShare, onOpenSettings,
}: ChatWindowProps) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const { isStreaming, activeTool } = streamingState;
  const isEmpty = messages.length === 0;
  const { copied, copy } = useCopyConversation(messages);

  // Regenerate: re-send the last user message
  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg || isStreaming) return;
    onSend(lastUserMsg.content, undefined, lastUserMsg.file_name);
  }, [messages, isStreaming, onSend]);

  // Index of the last assistant message (for attaching regenerate)
  const lastAssistantIdx = messages.reduce((acc, m, i) => (m.role === "assistant" ? i : acc), -1);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolled.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
  }, []);

  useEffect(() => {
    if (!userScrolled.current)
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (isStreaming && !userScrolled.current)
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isStreaming, messages]);

  return (
    <div className="flex flex-col w-full h-full" style={{ background: "#0A0A0A" }}>

      {/* Decorative asterisks */}
      <span className="asterisk-mark" style={{ top: "10%", right: "6%",  fontSize: 24, transform: "rotate(12deg)"  }} aria-hidden>✳</span>
      <span className="asterisk-mark" style={{ bottom: "30%", left: "4%", fontSize: 16, transform: "rotate(-18deg)" }} aria-hidden>✳</span>
      <span className="asterisk-mark" style={{ top: "52%", right: "16%",  fontSize: 11, transform: "rotate(4deg)"   }} aria-hidden>✳</span>

      {/* ── Top header ── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid #161616", minHeight: 52 }}
      >
        {/* Left: hamburger (mobile) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenMobileSidebar}
            className="md:hidden w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "#555" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            aria-label="Open sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Chat title / status */}
          {!isEmpty && (
            <div className="flex items-center gap-2 ml-1">
              <span className="status-pill">
                <span className="status-dot" />
                Online
              </span>
            </div>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Copy conversation */}
          {messages.length > 0 && (
            <button
              onClick={copy}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors"
              style={{ border: "1px solid #2A2A2A", color: copied ? "#C8F31D" : "#666", borderColor: copied ? "rgba(200,243,29,0.3)" : "#2A2A2A" }}
              title="Copy conversation"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
          )}

          {/* Share */}
          {activeChatId && (
            <button
              onClick={onOpenShare}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors"
              style={{ border: "1px solid #2A2A2A", color: "#666" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#C8F31D"; e.currentTarget.style.borderColor = "rgba(200,243,29,0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; e.currentTarget.style.borderColor = "#2A2A2A"; }}
              title="Share chat"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "#555" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C8F31D")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Scrollable messages ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }}
      >
        <div className="max-w-2xl mx-auto w-full px-4 py-10">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              /* ───────────── EMPTY STATE ───────────── */
              <motion.div
                key="welcome"
                className="flex flex-col items-center justify-center min-h-[55vh] text-center"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }} transition={SPRING_SOFT}
              >
                {/* Greeting */}
                <motion.p
                  className="text-sm font-medium mb-3"
                  style={{ color: "#9A9A9A", letterSpacing: "0.01em" }}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ENTER, delay: 0.05 }}
                >
                  Hi, I&apos;m Penda 👋
                </motion.p>

                {/* Hero headline — geometric sans + italic serif */}
                <motion.h1
                  className="text-[42px] sm:text-[52px] font-bold leading-[1.08] tracking-tight mb-4"
                  style={{ color: "#F5F5F5", letterSpacing: "-0.03em" }}
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ENTER, delay: 0.1 }}
                >
                  Ask me{" "}
                  <span className="font-serif-italic" style={{ color: "#C8F31D", fontWeight: 400 }}>
                    anything
                  </span>
                </motion.h1>

                <motion.p
                  className="text-[14.5px] mb-10 max-w-[340px]"
                  style={{ color: "#666", lineHeight: 1.65 }}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ENTER, delay: 0.16 }}
                >
                  Your AI assistant with memory, web search, and tools — built for real work.
                </motion.p>

                {/* Suggestion cards — 2×2 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                  {SUGGESTIONS.map((s, i) => (
                    <motion.button
                      key={s.text}
                      id={`suggestion-${i}`}
                      onClick={() => onSend(s.text)}
                      className="suggestion-card text-left"
                      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_ENTER, delay: 0.22 + i * 0.06 }}
                      whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                    >
                      <div className="mb-3">{s.icon}</div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#444" }}>{s.label}</p>
                      <p className="text-[13px] leading-snug" style={{ color: "#E0E0E0" }}>{s.text}</p>
                      <span className="suggestion-lime-line" aria-hidden />
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* ───────────── MESSAGES ───────────── */
              <motion.div
                key="messages"
                className="flex flex-col gap-7 pb-2"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
              >
                {messages.map((msg, i) => {
                  const isLast = i === messages.length - 1;
                  const isStreamingThis = isLast && msg.role === "assistant" && isStreaming;
                  const isLastAssistant = i === lastAssistantIdx;
                  return (
                    <MessageBubble
                      key={i}
                      message={msg}
                      isStreaming={isStreamingThis}
                      activeTool={isStreamingThis ? activeTool : null}
                      onRegenerate={isLastAssistant && !isStreaming ? handleRegenerate : undefined}
                    />
                  );
                })}

                {/* Loading indicator when waiting for first token */}
                {isStreaming && messages[messages.length - 1]?.role === "user" && (
                  <motion.div className="flex gap-3 items-start"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                    <div style={{ width: 20, flexShrink: 0, paddingTop: 4 }}>
                      <span style={{ color: "#C8F31D", fontSize: 14, display: "block" }}>✳</span>
                    </div>
                    <div className="typing-dots mt-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="mt-4 px-4 py-3 rounded-md text-[13.5px]"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* ── Input bar ── */}
      <div className="flex-shrink-0" style={{ borderTop: "1px solid #161616", background: "#0A0A0A" }}>
        <div className="max-w-2xl mx-auto w-full">
          <ChatInput onSend={onSend} onStop={onStop} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}
