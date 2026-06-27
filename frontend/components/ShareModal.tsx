"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2, Copy, Check, Loader2, Link as LinkIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { shareChat } from "@/lib/api";

const SPRING_POP = { type: "spring" as const, stiffness: 340, damping: 24, mass: 0.8 };

interface ShareModalProps {
  chatId: string;
  onClose: () => void;
}

export default function ShareModal({ chatId, onClose }: ShareModalProps) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function generateLink() {
    setLoading(true); setError(null);
    try {
      const res = await shareChat(token, chatId);
      setShareUrl(res.share_url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate share link.");
    } finally { setLoading(false); }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        className="w-full max-w-md mx-4 overflow-hidden"
        style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 12 }}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={SPRING_POP}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #2A2A2A" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md flex items-center justify-center"
              style={{ background: "rgba(200,243,29,0.08)", border: "1px solid rgba(200,243,29,0.2)" }}>
              <Share2 className="w-4 h-4" style={{ color: "#C8F31D" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#F5F5F5" }}>Share this Chat</h2>
              <p className="text-[11.5px]" style={{ color: "#555" }}>Generate a read-only public link</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
            style={{ color: "#555" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          <p className="text-[13.5px] leading-relaxed" style={{ color: "#9A9A9A" }}>
            Anyone with the link can view this conversation in read-only mode. No account required.
          </p>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div className="px-3.5 py-2.5 rounded-md text-sm"
                style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Share URL */}
          <AnimatePresence>
            {shareUrl && (
              <motion.div
                className="flex items-center gap-2.5 px-3.5 py-3 rounded-md"
                style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING_POP}
              >
                <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#555" }} />
                <span className="text-xs truncate flex-1 font-mono" style={{ color: "#9A9A9A" }}>{shareUrl}</span>
                <button
                  onClick={copyLink}
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] font-semibold transition-colors"
                  style={{ background: copied ? "rgba(200,243,29,0.1)" : "#2A2A2A", color: copied ? "#C8F31D" : "#9A9A9A", border: `1px solid ${copied ? "rgba(200,243,29,0.25)" : "transparent"}` }}
                >
                  {copied ? <><Check className="w-3 h-3" />Copied!</> : <><Copy className="w-3 h-3" />Copy</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-md text-sm font-medium transition-colors"
              style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", color: "#9A9A9A" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#9A9A9A")}>
              Cancel
            </button>
            <button
              onClick={shareUrl ? copyLink : generateLink}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-bold disabled:opacity-50 transition-opacity"
              style={{ background: "#C8F31D", color: "#0A0A0A" }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> :
               shareUrl ? <><Copy className="w-4 h-4" />Copy Link</> :
               <><Share2 className="w-4 h-4" />Generate Link</>}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
