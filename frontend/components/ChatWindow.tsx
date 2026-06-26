"use client";

import { useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Zap, Globe, Calculator, FileText } from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import { Message } from "@/types";
import { StreamingState } from "@/store/chatStore";

/* ── Spring presets ────────────────────────────────────────── */
const SPRING_ENTER  = { type: "spring" as const, stiffness: 260, damping: 22, mass: 0.9 };
const SPRING_SOFT   = { type: "spring" as const, stiffness: 180, damping: 28, mass: 1.1 };

const SUGGESTIONS = [
  { icon: <Zap className="w-4 h-4" />,        text: "Explain quantum computing simply"       },
  { icon: <Globe className="w-4 h-4" />,       text: "Search the web for latest AI news"      },
  { icon: <Calculator className="w-4 h-4" />,  text: "Calculate compound interest for 5 years" },
  { icon: <FileText className="w-4 h-4" />,    text: "Write a professional email draft"       },
];

interface ChatWindowProps {
  messages: Message[];
  streamingState: StreamingState;
  error: string | null;
  onSend: (text: string, docContent?: string, docName?: string) => void;
  onStop: () => void;
}

export default function ChatWindow({
  messages,
  streamingState,
  error,
  onSend,
  onStop,
}: ChatWindowProps) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);

  const { isStreaming, activeTool } = streamingState;
  const isEmpty = messages.length === 0;

  /* ── Smart auto-scroll: yields if user manually scrolled up ── */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolled.current = !atBottom;
  }, []);

  useEffect(() => {
    if (!userScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  /* Re-anchor when streaming new token */
  useEffect(() => {
    if (isStreaming && !userScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [isStreaming, messages]);

  return (
    /*
     * LAYOUT CONTRACT:
     * Parent gives full height via flex-1.
     * - Scrollable area fills all space above the pinned input bar.
     * - The animated gradient mesh sits behind everything via z-0.
     */
    <div className="flex flex-col w-full relative" style={{ height: "100%" }}>

      {/* ── Animated background mesh ── */}
      <div className="bg-mesh" aria-hidden="true" />

      {/* ── Scrollable message area ── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative z-10"
        style={{ minHeight: 0 }}
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-8">

          <AnimatePresence mode="wait">
            {isEmpty ? (
              /* ── Welcome screen ── */
              <motion.div
                key="welcome"
                className="flex flex-col items-center justify-center min-h-[60vh] text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12, scale: 0.97 }}
                transition={SPRING_SOFT}
              >
                {/* Logo orb — floating */}
                <motion.div
                  className="relative mb-7"
                  animate={{ y: [0, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {/* Glow ring */}
                  <div
                    className="absolute inset-0 rounded-2xl scale-[1.6] opacity-25 blur-xl"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                    aria-hidden="true"
                  />
                  <motion.div
                    className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                      boxShadow: "0 0 40px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    whileHover={{ scale: 1.08, rotate: 4 }}
                    transition={SPRING_ENTER}
                  >
                    <Sparkles className="w-8 h-8 text-white" />
                  </motion.div>
                </motion.div>

                <motion.h1
                  className="text-3xl font-bold text-white mb-2 tracking-tight"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ENTER, delay: 0.08 }}
                >
                  Hi, I&apos;m <span className="gradient-text">Penda</span>
                </motion.h1>

                <motion.p
                  className="text-zinc-500 text-[15px] mb-10 max-w-xs leading-relaxed"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING_ENTER, delay: 0.14 }}
                >
                  Your AI assistant with memory, web search, and tools.
                </motion.p>

                {/* Suggestion pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                  {SUGGESTIONS.map((s, i) => (
                    <motion.button
                      key={s.text}
                      id={`suggestion-${i}`}
                      onClick={() => onSend(s.text)}
                      className="
                        relative flex items-center gap-3 px-4 py-3.5
                        rounded-xl text-sm text-zinc-300 text-left overflow-hidden
                        border border-white/[0.07] bg-white/[0.03]
                        hover:border-penda-500/40 hover:bg-penda-600/[0.08]
                        hover:text-white group transition-colors duration-200
                      "
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...SPRING_ENTER, delay: 0.2 + i * 0.06 }}
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {/* Hover glow */}
                      <span
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{ background: "radial-gradient(ellipse at 30% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)" }}
                        aria-hidden="true"
                      />
                      <span className="text-zinc-600 group-hover:text-penda-400 transition-colors duration-200 flex-shrink-0 relative z-10">
                        {s.icon}
                      </span>
                      <span className="relative z-10">{s.text}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* ── Message list ── */
              <motion.div
                key="messages"
                className="flex flex-col gap-6 pb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                {messages.map((msg, i) => {
                  const isLast = i === messages.length - 1;
                  const isStreamingThis = isLast && msg.role === "assistant" && isStreaming;
                  return (
                    <MessageBubble
                      key={i}
                      message={msg}
                      isStreaming={isStreamingThis}
                      activeTool={isStreamingThis ? activeTool : null}
                    />
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="mt-4 px-4 py-3.5 rounded-xl text-red-400 text-sm flex items-start gap-2"
                style={{
                  background: "rgba(239,68,68,0.07)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  backdropFilter: "blur(8px)",
                }}
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0,  scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING_ENTER}
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* ── Pinned bottom input bar ── */}
      <div
        className="flex-shrink-0 relative z-10"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(9,9,11,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <ChatInput onSend={onSend} onStop={onStop} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}
