"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, Zap, Globe, Calculator, FileText } from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import ChatInput from "@/components/ChatInput";
import { Message } from "@/types";
import { StreamingState } from "@/hooks/useChat";

const SUGGESTIONS = [
  { icon: <Zap className="w-4 h-4" />, text: "Explain quantum computing simply" },
  { icon: <Globe className="w-4 h-4" />, text: "Search the web for latest AI news" },
  { icon: <Calculator className="w-4 h-4" />, text: "Calculate compound interest for 5 years" },
  { icon: <FileText className="w-4 h-4" />, text: "Write a professional email draft" },
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isStreaming, activeTool } = streamingState;
  const isEmpty = messages.length === 0;

  // Auto-scroll whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    /*
     * LAYOUT CONTRACT:
     * This component is given the full remaining height by the parent (flex-1).
     * Internally:
     *   - The scrollable messages area gets all space above the fixed input (flex-1 + overflow-y-auto)
     *   - The input bar is always stuck to the bottom (flex-shrink-0)
     */
    <div className="flex flex-col w-full" style={{ height: "100%" }}>

      {/* ── Scrollable message area ── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0 }} /* critical: prevents flex child from overflowing */
      >
        <div className="max-w-3xl mx-auto w-full px-4 py-6">

          {isEmpty ? (
            /* Welcome screen */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <motion.div
                className="relative mb-6"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center relative z-10"
                  style={{
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    boxShadow: "0 0 40px rgba(124,58,237,0.4)",
                  }}
                >
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
              </motion.div>

              <h1 className="text-3xl font-bold text-white mb-2">
                Hi, I&apos;m <span className="gradient-text">Penda</span>
              </h1>
              <p className="text-zinc-500 text-base mb-10 max-w-xs">
                Your AI assistant with memory, web search, and tools.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button
                    key={s.text}
                    onClick={() => onSend(s.text)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm
                               text-zinc-300 text-left border border-zinc-800 bg-zinc-900/50
                               hover:bg-zinc-800/80 hover:border-zinc-700 hover:text-white
                               transition-all duration-200 group"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.06 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-zinc-600 group-hover:text-penda-400 transition-colors flex-shrink-0">
                      {s.icon}
                    </span>
                    {s.text}
                  </motion.button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            <div className="flex flex-col gap-6 pb-2">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const isStreamingThis =
                  isLast && msg.role === "assistant" && isStreaming;
                return (
                  <MessageBubble
                    key={i}
                    message={msg}
                    isStreaming={isStreamingThis}
                    activeTool={isStreamingThis ? activeTool : null}
                  />
                );
              })}
            </div>
          )}

          {/* Error banner */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="mt-4 px-4 py-3 rounded-xl text-red-400 text-sm"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                ⚠️ {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Fixed bottom input bar ── */}
      <div className="flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-3xl mx-auto w-full">
          <ChatInput
            onSend={onSend}
            onStop={onStop}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </div>
  );
}
