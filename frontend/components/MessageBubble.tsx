"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message } from "@/types";
import { Sparkles, User, Copy, Check } from "lucide-react";
import { useState } from "react";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  activeTool?: string | null;
}

export default function MessageBubble({
  message,
  isStreaming = false,
  activeTool = null,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      className={`flex gap-4 w-full ${isUser ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Avatar — assistant only */}
      {!isUser && (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Bubble */}
      <div className={`group relative max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {/* Tool call indicator while streaming */}
        {!isUser && isStreaming && activeTool && (
          <motion.div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-2 text-xs font-medium"
            style={{
              background: "rgba(124, 58, 237, 0.12)",
              border: "1px solid rgba(124, 58, 237, 0.25)",
              color: "#a78bfa",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            Using <span className="font-semibold">{activeTool}</span>…
          </motion.div>
        )}

        <div
          className={`relative px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "rounded-tr-sm text-white"
              : "rounded-tl-sm text-zinc-100"
          }`}
          style={
            isUser
              ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 4px 16px rgba(124,58,237,0.25)" }
              : { background: "rgba(24,24,27,0.8)", border: "1px solid rgba(255,255,255,0.07)" }
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={`prose-penda ${isStreaming && !message.content ? "" : ""}`}>
              {message.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // @ts-expect-error — react-markdown inline prop type mismatch
                    code({ inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <SyntaxHighlighter
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          style={oneDark as any}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: "8px 0",
                            borderRadius: "10px",
                            fontSize: "13px",
                            background: "#0d0d10",
                          }}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                // Empty streaming placeholder
                <div className="flex items-center gap-1.5 py-0.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              )}
              {/* Streaming cursor */}
              {isStreaming && message.content && (
                <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 align-middle animate-cursor-blink" />
              )}
            </div>
          )}
        </div>

        {/* Copy button — assistant messages only, visible on hover */}
        {!isUser && message.content && !isStreaming && (
          <button
            onClick={copyContent}
            className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 self-end
                       p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800"
            aria-label="Copy message"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Avatar — user only */}
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 bg-zinc-700">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
      )}
    </motion.div>
  );
}
