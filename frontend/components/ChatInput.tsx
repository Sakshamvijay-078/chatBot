"use client";

import { useRef, useState, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Square, Paperclip, X, FileText, AlertCircle,
  Eye, Download, ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { PendingDocument, Document as AppDocument } from "@/types";
import { listDocuments } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/* ── Spring presets ────────────────────────────────────────── */
const SPRING_POP = { type: "spring" as const, stiffness: 360, damping: 22, mass: 0.7 };

const ACCEPTED_TYPES =
  ".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.xml,.yaml,.yml,.cpp,.java,.c,.h,.hpp,.cs,.php,.rb,.swift,.go,.rs,.pdf";
const MAX_SIZE_BYTES = 10_000_000; // 10 MB — matches backend limit

const MODES = ["Fast", "Pro"] as const;
type Mode = typeof MODES[number];

interface ChatInputProps {
  onSend: (text: string, docContent?: string, docName?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

/* ── File Preview Modal ──────────────────────────────────────── */
function FilePreviewModal({
  doc,
  onClose,
}: {
  doc: PendingDocument;
  onClose: () => void;
}) {
  const isText = !doc.content.startsWith("data:");

  function handleDownload() {
    let href: string;
    let filename = doc.name;

    if (isText) {
      const blob = new Blob([doc.content], { type: "text/plain" });
      href = URL.createObjectURL(blob);
    } else {
      href = doc.content;
    }

    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    if (isText) URL.revokeObjectURL(href);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="preview-modal"
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={SPRING_POP}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid #2A2A2A" }}
        >
          <div className="flex items-center gap-2.5">
            <FileText className="w-4 h-4" style={{ color: "#C8F31D" }} />
            <span className="text-sm font-semibold" style={{ color: "#F5F5F5" }}>
              {doc.name}
            </span>
            <span className="text-xs" style={{ color: "#555555" }}>
              ({(doc.size / 1024).toFixed(1)} KB)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{
                background: "#C8F31D",
                color: "#0A0A0A",
              }}
            >
              <Download className="w-3 h-3" />
              Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "#555555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          {isText ? (
            <pre
              className="text-xs leading-relaxed whitespace-pre-wrap break-words font-mono"
              style={{ color: "#9A9A9A" }}
            >
              {doc.content || "(empty file)"}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <FileText className="w-16 h-16" style={{ color: "#2A2A2A" }} />
              <p className="text-sm" style={{ color: "#9A9A9A" }}>
                PDF preview not available — click Download to open
              </p>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold"
                style={{ background: "#C8F31D", color: "#0A0A0A" }}
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/* ── Main ChatInput ─────────────────────────────────────────── */
export default function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const { session } = useAuth();
  const [value,       setValue]       = useState("");
  const [pendingDoc,  setPendingDoc]  = useState<PendingDocument | null>(null);
  const [fileError,   setFileError]   = useState<string | null>(null);
  const [focused,     setFocused]     = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mode,        setMode]        = useState<Mode>("Fast");
  const [modeOpen,    setModeOpen]    = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // PDF read/extract state

  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  useEffect(() => {
    if (session?.access_token) {
      listDocuments(session.access_token).then(setDocs).catch(console.error);
    }
  }, [session]);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Auto-grow textarea ── */
  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setValue(val);
    autoResize();

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/(?:^|\s)@([^ ]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (isStreaming || disabled) return;
    if (!text && !pendingDoc) return;
    const msg = text || (pendingDoc ? `Please analyze the attached document: ${pendingDoc.name}` : "");
    onSend(msg, pendingDoc?.content, pendingDoc?.name);
    setValue("");
    setPendingDoc(null);
    setFileError(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function insertMention(name: string) {
    const cursor = textareaRef.current?.selectionStart || value.length;
    const textBefore = value.slice(0, cursor);
    const textAfter = value.slice(cursor);
    const textBeforeMatch = textBefore.replace(/(?:^|\s)@[^ ]*$/, (m) => m.startsWith(" ") ? " @" : "@");
    const newVal = textBeforeMatch + name + " " + textAfter;
    setValue(newVal);
    setMentionQuery(null);
    setTimeout(autoResize, 0);
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null) {
      const filtered = docs.filter(d => d.name.toLowerCase().includes(mentionQuery.toLowerCase()));
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, filtered.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered.length > 0) {
          insertMention(filtered[mentionIndex].name);
        }
        return;
      } else if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleFileClick() {
    setFileError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target.files?.length) return;
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`File too large (max 10 MB). This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }

    setIsProcessing(true);
    setFileError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setIsProcessing(false);
      if (!result) { setFileError("Could not read file."); return; }
      setPendingDoc({ name: file.name, content: result, size: file.size });
      setFileError(null);
    };
    reader.onerror = () => { setIsProcessing(false); setFileError("Failed to read file."); };

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  // Close mode dropdown on click outside
  useEffect(() => {
    if (!modeOpen) return;
    const handler = () => setModeOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [modeOpen]);

  const canSend = !isStreaming && !disabled && !isProcessing && (value.trim().length > 0 || pendingDoc !== null);
  const borderColor = focused ? "#C8F31D" : "#2A2A2A";

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileChange}
        aria-label="Attach document"
      />

      {/* File preview modal */}
      <AnimatePresence>
        {previewOpen && pendingDoc && (
          <FilePreviewModal
            doc={pendingDoc}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* File error banner */}
      <AnimatePresence>
        {fileError && (
          <motion.div
            className="flex items-center gap-2 mb-2 px-3.5 py-2.5 rounded-md text-sm"
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171",
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{fileError}</span>
            <button
              onClick={() => setFileError(null)}
              style={{ color: "#f87171", opacity: 0.7 }}
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending document chip / processing indicator */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            className="flex items-center gap-3 mb-2 px-3.5 py-2.5 rounded-md text-sm"
            style={{
              background: "#161616",
              border: "1px solid rgba(200,243,29,0.25)",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
            >
              {/* Spinning indicator */}
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#2A2A2A" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#C8F31D" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium block" style={{ color: "#C8F31D" }}>
                Reading file…
              </span>
              <span className="text-xs" style={{ color: "#555555" }}>
                Extracting content, please wait
              </span>
            </div>
          </motion.div>
        )}
        {!isProcessing && pendingDoc && (
          <motion.div
            className="flex items-center gap-3 mb-2 px-3.5 py-2.5 rounded-md text-sm"
            style={{
              background: "#161616",
              border: "1px solid #2A2A2A",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
            >
              <FileText className="w-4 h-4" style={{ color: "#C8F31D" }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium truncate block" style={{ color: "#F5F5F5" }}>
                {pendingDoc.name}
              </span>
              <span className="text-xs" style={{ color: "#555555" }}>
                {(pendingDoc.size / 1024).toFixed(1)} KB
              </span>
            </div>

            {/* Preview button */}
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                border: "1px solid #2A2A2A",
                color: "#9A9A9A",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(200,243,29,0.35)";
                e.currentTarget.style.color = "#C8F31D";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2A2A2A";
                e.currentTarget.style.color = "#9A9A9A";
              }}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>

            <button
              onClick={() => setPendingDoc(null)}
              className="p-1 transition-colors flex-shrink-0"
              style={{ color: "#555555" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
              aria-label="Remove document"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mention popover */}
      <AnimatePresence>
        {mentionQuery !== null && (
          <motion.div
            className="absolute z-10 w-64 rounded-xl overflow-hidden shadow-lg"
            style={{
              background: "#161616",
              border: "1px solid #2A2A2A",
              bottom: "100%",
              marginBottom: 8,
              left: 16,
            }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {docs.filter(d => d.name.toLowerCase().includes(mentionQuery.toLowerCase())).length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: "#9A9A9A" }}>No documents found</div>
            ) : (
              docs.filter(d => d.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5).map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => insertMention(d.name)}
                  className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
                  style={{
                    background: i === mentionIndex ? "rgba(200,243,29,0.1)" : "transparent",
                    color: i === mentionIndex ? "#C8F31D" : "#F5F5F5",
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main input form ── */}
      <form
        onSubmit={handleSubmit}
        className="relative rounded-lg"
        style={{
          background: "#161616",
          border: `1px solid ${borderColor}`,
          transition: "border-color 0.18s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={1}
          disabled={disabled || isStreaming}
          placeholder={
            isStreaming
              ? "Penda is thinking…"
              : pendingDoc
              ? "Ask something about the document, or press Send…"
              : "Message Penda…"
          }
          className={clsx(
            "w-full resize-none bg-transparent text-sm leading-relaxed outline-none",
            "px-4 py-3.5 pr-36",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
          style={{
            color: "#F5F5F5",
            minHeight: 52,
            maxHeight: 220,
          }}
        />

        {/* Placeholder color override */}
        <style>{`
          #chat-input::placeholder { color: #555555; }
        `}</style>

        {/* Action buttons row */}
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">

          {/* Mode selector pill */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setModeOpen(!modeOpen); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11.5px] font-medium transition-colors"
              style={{
                background: "#1E1E1E",
                border: "1px solid #2A2A2A",
                color: "#9A9A9A",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#444";
                e.currentTarget.style.color = "#F5F5F5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2A2A2A";
                e.currentTarget.style.color = "#9A9A9A";
              }}
            >
              {mode}
              <ChevronDown className="w-3 h-3" />
            </button>

            <AnimatePresence>
              {modeOpen && (
                <motion.div
                  className="absolute bottom-full mb-1 right-0 rounded-md overflow-hidden"
                  style={{
                    background: "#161616",
                    border: "1px solid #2A2A2A",
                    minWidth: 80,
                    zIndex: 10,
                  }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.14 }}
                >
                  {MODES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setModeOpen(false); }}
                      className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                      style={{
                        color: m === mode ? "#C8F31D" : "#9A9A9A",
                        background: m === mode ? "rgba(200,243,29,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (m !== mode) e.currentTarget.style.color = "#F5F5F5";
                      }}
                      onMouseLeave={(e) => {
                        if (m !== mode) e.currentTarget.style.color = "#9A9A9A";
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Paperclip */}
          <motion.button
            type="button"
            onClick={handleFileClick}
            disabled={isStreaming}
            whileTap={{ scale: 0.88 }}
            className="p-1.5 rounded-md transition-colors"
            style={{
              color: pendingDoc ? "#C8F31D" : "#555555",
            }}
            onMouseEnter={(e) => {
              if (!pendingDoc) e.currentTarget.style.color = "#9A9A9A";
            }}
            onMouseLeave={(e) => {
              if (!pendingDoc) e.currentTarget.style.color = "#555555";
            }}
            title={`Attach a document (${ACCEPTED_TYPES})`}
          >
            <Paperclip className="w-4 h-4" />
          </motion.button>

          {/* Send / Stop — circular lime button */}
          <AnimatePresence mode="wait">
            {isStreaming ? (
              <motion.button
                key="stop"
                type="button"
                onClick={onStop}
                className="flex items-center justify-center w-8 h-8 rounded-full"
                style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                exit={{ scale: 0.5,    opacity: 0 }}
                transition={SPRING_POP}
                whileTap={{ scale: 0.88 }}
                title="Stop generation"
              >
                <Square className="w-3 h-3" style={{ color: "#9A9A9A" }} fill="currentColor" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                type="submit"
                disabled={!canSend}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-opacity"
                style={{
                  background: canSend ? "#C8F31D" : "#1E1E1E",
                  border: canSend ? "none" : "1px solid #2A2A2A",
                  opacity: canSend ? 1 : 0.5,
                }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                exit={{ scale: 0.5,    opacity: 0 }}
                transition={SPRING_POP}
                whileTap={{ scale: 0.88 }}
                title="Send message (Enter)"
              >
                <Send className="w-3.5 h-3.5" style={{ color: canSend ? "#0A0A0A" : "#555555" }} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </form>

      <p className="hidden sm:block text-center text-[11px] mt-2" style={{ color: "#3A3A3A" }}>
        Penda can make mistakes. Verify important information.
      </p>
    </div>
  );
}
