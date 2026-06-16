"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Square, Paperclip, X, FileText, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { PendingDocument } from "@/types";

const ACCEPTED_TYPES = ".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.xml,.yaml,.yml,.cpp,.java,.c,.h,.hpp,.cs,.php,.rb,.swift,.go,.rs,.pdf";
const MAX_SIZE_BYTES = 500_000; // 500 KB limit

interface ChatInputProps {
  onSend: (text: string, docContent?: string, docName?: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [pendingDoc, setPendingDoc] = useState<PendingDocument | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    autoResize();
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

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }

  function handleFileClick() {
    setFileError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!e.target.files?.length) return;
    e.target.value = "";  // reset so the same file can be re-selected

    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`File too large (max 500 KB). This file is ${(file.size / 1024).toFixed(0)} KB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (!result) { setFileError("Could not read file."); return; }
      setPendingDoc({ name: file.name, content: result, size: file.size });
      setFileError(null);
    };
    reader.onerror = () => setFileError("Failed to read file.");
    
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  }

  const canSend = (!isStreaming && !disabled) && (value.trim().length > 0 || pendingDoc !== null);

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

      {/* File error */}
      <AnimatePresence>
        {fileError && (
          <motion.div
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-sm text-red-400"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{fileError}</span>
            <button onClick={() => setFileError(null)} className="text-red-500 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending document chip */}
      <AnimatePresence>
        {pendingDoc && (
          <motion.div
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl text-sm"
            style={{ background: "rgba(124,58,237,0.10)", border: "1px solid rgba(124,58,237,0.25)" }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
          >
            <FileText className="w-4 h-4 text-penda-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-penda-300 font-medium truncate block">{pendingDoc.name}</span>
              <span className="text-zinc-500 text-xs">{(pendingDoc.size / 1024).toFixed(1)} KB</span>
            </div>
            <button
              onClick={() => setPendingDoc(null)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
              aria-label="Remove document"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input form */}
      <motion.form
        onSubmit={handleSubmit}
        className="relative rounded-2xl border transition-all duration-200"
        style={{
          background: "rgba(18,18,22,0.9)",
          borderColor: (value.length > 0 || pendingDoc)
            ? "rgba(124,58,237,0.45)"
            : "rgba(255,255,255,0.08)",
          boxShadow: (value.length > 0 || pendingDoc)
            ? "0 0 0 3px rgba(124,58,237,0.08), 0 4px 24px rgba(0,0,0,0.2)"
            : "0 4px 24px rgba(0,0,0,0.2)",
        }}
        layout
      >
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled || isStreaming}
          placeholder={
            isStreaming
              ? "Penda is thinking…"
              : pendingDoc
              ? "Ask something about the document, or press Send…"
              : "Ask anything… (Shift+Enter for newline)"
          }
          className={clsx(
            "w-full resize-none bg-transparent text-[14.5px] text-zinc-100 placeholder-zinc-600",
            "px-4 py-3.5 pr-28 outline-none leading-relaxed",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
          style={{ minHeight: 52, maxHeight: 220 }}
        />

        {/* Action buttons row */}
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {/* Paperclip — attach document */}
          <button
            type="button"
            onClick={handleFileClick}
            disabled={isStreaming}
            className={clsx(
              "p-1.5 rounded-lg transition-colors",
              pendingDoc
                ? "text-penda-400 bg-penda-500/10"
                : "text-zinc-600 hover:text-zinc-400"
            )}
            title={`Attach a document (${ACCEPTED_TYPES})`}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <AnimatePresence mode="wait">
            {isStreaming ? (
              <motion.button
                key="stop"
                type="button"
                onClick={onStop}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-700 hover:bg-zinc-600 transition-all"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                title="Stop generation"
              >
                <Square className="w-4 h-4 text-zinc-200" fill="currentColor" />
              </motion.button>
            ) : (
              <motion.button
                key="send"
                type="submit"
                disabled={!canSend}
                className={clsx(
                  "flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-200",
                  canSend
                    ? "text-white shadow-glow-sm hover:shadow-glow-violet active:scale-95"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                )}
                style={canSend ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)" } : {}}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </motion.form>

      <p className="hidden sm:block text-center text-zinc-700 text-xs mt-2">
        Penda can make mistakes. Verify important information.
      </p>
    </div>
  );
}
