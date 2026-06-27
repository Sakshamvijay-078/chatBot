"use client";

import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Message } from "@/types";
import { Copy, Check, Wrench, FileText, Eye, Download, RefreshCw } from "lucide-react";
import { useState, useCallback } from "react";

const SPRING_POP = { type: "spring" as const, stiffness: 340, damping: 22, mass: 0.8 };

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  activeTool?: string | null;
}

/* ── Code block copy button ─────────────────────────── */
function CopyCodeButton({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code);
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button
      onClick={copy}
      aria-label="Copy code"
      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium opacity-0 group-hover/code:opacity-100 transition-all"
      style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: done ? "#C8F31D" : "#666" }}
    >
      {done ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
    </button>
  );
}

/* ── Generated file card ─────────────────────────────── */
function GeneratedFileCard({ filename, content }: { filename: string; content: string }) {
  const [open, setOpen] = useState(false);

  function download() {
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-3 rounded-md overflow-hidden" style={{ border: "1px solid #2A2A2A", background: "#111" }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid #2A2A2A" }}>
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" style={{ color: "#C8F31D" }} />
          <span className="text-xs font-semibold" style={{ color: "#F5F5F5" }}>{filename}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
            style={{ border: `1px solid ${open ? "rgba(200,243,29,0.3)" : "#2A2A2A"}`, color: open ? "#C8F31D" : "#666", background: open ? "rgba(200,243,29,0.05)" : "transparent" }}
          >
            <Eye className="w-3 h-3" />{open ? "Hide" : "Preview"}
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold"
            style={{ background: "#C8F31D", color: "#0A0A0A" }}
          >
            <Download className="w-3 h-3" />Download
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
            <pre className="p-4 text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-words"
              style={{ color: "#9A9A9A", maxHeight: 300, fontFamily: "monospace" }}>
              {content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* Parse content for ```file:name blocks */
function parseContent(content: string) {
  const parts: Array<{ type: "text" | "file"; text?: string; filename?: string; fileContent?: string }> = [];
  const FILE_RE = /```file:([^\n]+)\n([\s\S]*?)```/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = FILE_RE.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", text: content.slice(last, m.index) });
    parts.push({ type: "file", filename: m[1].trim(), fileContent: m[2] });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", text: content.slice(last) });
  return parts;
}

export default function MessageBubble({ message, isStreaming = false, activeTool = null }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const copyMsg = useCallback(async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [message.content]);

  const parts = parseContent(message.content ?? "");

  return (
    <motion.div
      className={`flex gap-3 w-full ${isUser ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24, mass: 0.9 }}
      layout="position"
    >
      {/* Assistant mark */}
      {!isUser && (
        <div className="flex-shrink-0 mt-1" style={{ width: 18 }}>
          <span style={{ color: "#C8F31D", fontSize: 13, fontWeight: 300, display: "block", marginTop: 3 }} aria-hidden>✳</span>
        </div>
      )}

      {/* Body */}
      <div
        className="group relative flex flex-col gap-2"
        style={{
          maxWidth: isUser ? "76%" : "84%",
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {/* Tool indicator */}
        <AnimatePresence>
          {!isUser && isStreaming && activeTool && (
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium self-start"
              style={{ background: "rgba(200,243,29,0.05)", border: "1px solid rgba(200,243,29,0.18)", color: "#9A9A9A" }}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }} transition={SPRING_POP}
            >
              <span className="lime-dot" />
              <Wrench className="w-3 h-3" style={{ color: "#C8F31D" }} />
              <span>Using <strong style={{ color: "#C8F31D" }}>{activeTool}</strong>…</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Message content */}
        {isUser ? (
          /* User bubble */
          <div
            className="px-4 py-3 rounded-lg rounded-tr-sm text-sm leading-relaxed"
            style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#F5F5F5" }}
          >
            {message.file_name && (
              <div className="flex items-center gap-2 mb-2 pb-2 text-xs"
                style={{ borderBottom: "1px solid #2A2A2A", color: "#9A9A9A" }}>
                <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#C8F31D" }} />
                <span className="truncate">{message.file_name}</span>
              </div>
            )}
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          /* Assistant — borderless editorial text */
          <div className="text-sm leading-[1.8]" style={{ color: "#E8E8E8" }}>
            {message.content ? (
              <div className="prose-penda">
                {parts.map((part, idx) =>
                  part.type === "file" ? (
                    <GeneratedFileCard key={idx} filename={part.filename!} content={part.fileContent!} />
                  ) : (
                    <ReactMarkdown
                      key={idx}
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // @ts-expect-error — inline prop type mismatch
                        code({ inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "");
                          const code  = String(children).replace(/\n$/, "");
                          return !inline && match ? (
                            <div className="relative group/code my-2.5">
                              <div className="absolute top-0 left-0 px-3 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider select-none" style={{ color: "#444" }}>
                                {match[1]}
                              </div>
                              <SyntaxHighlighter
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                style={oneDark as any}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ margin: 0, borderRadius: 9, fontSize: "12.5px", background: "#0F0F0F", border: "1px solid #2A2A2A", paddingTop: 28 }}
                              >
                                {code}
                              </SyntaxHighlighter>
                              <CopyCodeButton code={code} />
                            </div>
                          ) : (
                            <code className={className} {...props}>{children}</code>
                          );
                        },
                        table({ children }) {
                          return <div className="overflow-x-auto my-3"><table className="w-full border-collapse text-sm">{children}</table></div>;
                        },
                      }}
                    >
                      {part.text ?? ""}
                    </ReactMarkdown>
                  )
                )}
              </div>
            ) : (
              <div className="typing-dots">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            )}
            {isStreaming && message.content && <span className="streaming-cursor" aria-hidden />}
          </div>
        )}

        {/* ── Action toolbar — appears on hover after streaming ends ── */}
        {!isStreaming && message.content && (
          <motion.div
            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            style={{ alignSelf: isUser ? "flex-end" : "flex-start" }}
          >
            {/* Copy */}
            <button
              onClick={copyMsg}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors"
              style={{ color: copied ? "#C8F31D" : "#555", border: `1px solid ${copied ? "rgba(200,243,29,0.25)" : "#222"}` }}
              title="Copy message"
            >
              {copied ? <><Check className="w-3 h-3" />Copied</> : <><Copy className="w-3 h-3" />Copy</>}
            </button>

            {/* Re-prompt (assistant only) */}
            {!isUser && (
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-colors"
                style={{ color: "#555", border: "1px solid #222" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#9A9A9A"; e.currentTarget.style.borderColor = "#333"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; e.currentTarget.style.borderColor = "#222"; }}
                title="Regenerate"
                disabled
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
