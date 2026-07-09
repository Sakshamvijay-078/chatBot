"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Sparkles, User, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { getSharedChat } from "@/lib/api";
import { Message } from "@/types";

const SPRING_POP = { type: "spring" as const, stiffness: 320, damping: 20, mass: 0.8 };
const SPRING_ENTER = { type: "spring" as const, stiffness: 260, damping: 22, mass: 0.9 };

function CopyCodeButton({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <motion.button
      onClick={copy}
      whileTap={{ scale: 0.9 }}
      aria-label="Copy code"
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800/90 border border-white/[0.06] text-zinc-400 opacity-0 group-hover/code:opacity-100 hover:text-white hover:bg-zinc-700 transition-all duration-150"
    >
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.span key="check" className="flex items-center gap-1 text-emerald-400" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING_POP}>
            <Check className="w-3 h-3" /> Copied
          </motion.span>
        ) : (
          <motion.span key="copy" className="flex items-center gap-1" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING_POP}>
            <Copy className="w-3 h-3" /> Copy
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      className={`flex gap-3.5 w-full ${isUser ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_ENTER}
    >
      {!isUser && (
        <div
          className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
          style={{ background: "#C8F31D" }}
        >
          <Sparkles className="w-4 h-4 text-[#0A0A0A]" />
        </div>
      )}

      <div className={`group relative max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`relative px-4 py-3.5 text-sm leading-relaxed ${isUser ? "rounded-2xl rounded-tr-md text-white" : "rounded-2xl rounded-tl-md text-zinc-100"}`}
          style={
            isUser
              ? { background: "#1F1F1F", border: "1px solid #2A2A2A" }
              : { background: "transparent" }
          }
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-penda">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // @ts-expect-error — inline prop mismatch
                  code({ inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeStr = String(children).replace(/\n$/, "");
                    return !inline && match ? (
                      <div className="relative group/code my-1">
                        <div className="absolute top-0 left-0 px-3 py-1 text-[10px] font-mono font-semibold text-zinc-500 uppercase tracking-wider select-none">
                          {match[1]}
                        </div>
                        <SyntaxHighlighter
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          style={oneDark as any}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ margin: 0, borderRadius: "12px", fontSize: "13px", background: "#0b0b0f", border: "1px solid rgba(255,255,255,0.07)", paddingTop: "30px" }}
                        >
                          {codeStr}
                        </SyntaxHighlighter>
                        <CopyCodeButton code={codeStr} />
                      </div>
                    ) : (
                      <code className={className} {...props}>{children}</code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Copy button */}
        {!isUser && message.content && (
          <motion.button
            onClick={copyContent}
            whileTap={{ scale: 0.88 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="group-hover:opacity-100 transition-opacity self-start mt-0.5 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/70"
            aria-label="Copy message"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span key="done" className="flex items-center gap-1 text-emerald-400" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING_POP}>
                  <Check className="w-3 h-3" /> Copied
                </motion.span>
              ) : (
                <motion.span key="idle" className="flex items-center gap-1" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING_POP}>
                  <Copy className="w-3 h-3" /> Copy
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 bg-[#1F1F1F] border border-[#2A2A2A]">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
      )}
    </motion.div>
  );
}

export default function SharePage() {
  const params = useParams();
  const token = params?.token as string;

  const [title, setTitle] = useState("Shared Conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await getSharedChat(token);
        setTitle(data.title);
        setMessages(data.messages);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "This link is invalid or has expired.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div
      className="min-h-screen"
      style={{ background: "#09090b", fontFamily: "'Inter', sans-serif" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-4 py-3.5"
        style={{ borderBottom: "1px solid #1F1F1F", background: "#0A0A0A" }}
      >
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "#C8F31D" }}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#0A0A0A]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
            <p className="text-xs text-zinc-500">Shared read-only conversation · Penda AI</p>
          </div>
          <a
            href="/"
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid #2A2A2A", color: "#C8F31D" }}
          >
            Try Penda
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#C8F31D" }} />
            <p className="text-sm text-zinc-500">Loading conversation…</p>
          </div>
        )}

        {error && !loading && (
          <motion.div
            className="flex flex-col items-center justify-center py-24 gap-4 text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Link Not Found</h2>
              <p className="text-sm text-zinc-500 max-w-xs">{error}</p>
            </div>
            <a
              href="/"
              className="mt-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ background: "#C8F31D", color: "#0A0A0A" }}
            >
              Go to Penda
            </a>
          </motion.div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="flex flex-col gap-6 pb-12">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
