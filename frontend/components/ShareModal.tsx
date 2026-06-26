"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share2, Copy, Check, Loader2, Link } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { shareChat } from "@/lib/api";

const SPRING_POP = { type: "spring" as const, stiffness: 320, damping: 22, mass: 0.8 };

interface ShareModalProps {
  chatId: string;
  onClose: () => void;
}

export default function ShareModal({ chatId, onClose }: ShareModalProps) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateLink() {
    setLoading(true);
    setError(null);
    try {
      const res = await shareChat(token, chatId);
      setShareUrl(res.share_url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate share link.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={SPRING_POP}
        style={{
          background: "linear-gradient(135deg, rgba(20,20,28,0.98) 0%, rgba(14,14,20,0.99) 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              <Share2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Share this Chat</h2>
              <p className="text-xs text-zinc-500">Generate a read-only public link</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400 leading-relaxed">
            Anyone with the link can view this conversation in read-only mode.
            They won&apos;t need an account to access it.
          </p>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                className="px-3.5 py-2.5 rounded-lg text-sm text-red-400"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Share URL display */}
          <AnimatePresence>
            {shareUrl && (
              <motion.div
                className="flex items-center gap-2 px-3.5 py-3 rounded-xl"
                style={{
                  background: "rgba(124,58,237,0.07)",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={SPRING_POP}
              >
                <Link className="w-3.5 h-3.5 text-penda-400 flex-shrink-0" />
                <span className="text-xs text-penda-300 truncate flex-1 font-mono">{shareUrl}</span>
                <motion.button
                  onClick={copyLink}
                  whileTap={{ scale: 0.88 }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: copied ? "rgba(52,211,153,0.12)" : "rgba(124,58,237,0.2)",
                    color: copied ? "#34d399" : "#c4b5fd",
                    border: `1px solid ${copied ? "rgba(52,211,153,0.25)" : "rgba(124,58,237,0.3)"}`,
                  }}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {copied ? (
                      <motion.span
                        key="check"
                        className="flex items-center gap-1"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={SPRING_POP}
                      >
                        <Check className="w-3 h-3" /> Copied!
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        className="flex items-center gap-1"
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        transition={SPRING_POP}
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              Cancel
            </button>
            <motion.button
              onClick={shareUrl ? copyLink : generateLink}
              disabled={loading}
              whileTap={{ scale: 0.96 }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                boxShadow: "0 4px 16px rgba(124,58,237,0.3)",
              }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : shareUrl ? (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Generate Link
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
