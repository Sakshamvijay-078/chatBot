"use client";

/**
 * /auth/reset-password
 * Supabase sends users here after clicking the password-reset email link.
 * The URL will contain a hash fragment: #access_token=...&type=recovery
 * Supabase JS auto-parses this and fires the PASSWORD_RECOVERY auth event.
 */

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Sparkles, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PageState = "loading" | "ready" | "success" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    /**
     * Supabase JS listens to the URL hash and fires PASSWORD_RECOVERY
     * when it detects a recovery token. We just wait for that event.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("ready");
      } else if (event === "SIGNED_IN") {
        // Could also fire after recovery — treat same as ready
        setPageState("ready");
      }
    });

    // If Supabase already processed the hash (page reload), check for session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPageState("ready");
    });

    // Timeout fallback — if no event after 4 s, show error
    const timeout = setTimeout(() => {
      setPageState((prev) => (prev === "loading" ? "error" : prev));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPw) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      setPageState("success");
      // Auto-redirect after 2.5 s
      setTimeout(() => router.push("/auth/login"), 2500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-900/25 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl animate-pulse-slow" />
      </div>

      <motion.div
        className="w-full max-w-md z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          >
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Set New Password</h1>
          <p className="text-zinc-400 text-sm">Choose a strong new password for your account</p>
        </div>

        <div className="glass-strong rounded-2xl p-8 shadow-glass">
          {/* Loading state */}
          {pageState === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-2 border-penda-500/30 border-t-penda-500 rounded-full animate-spin" />
              <p className="text-zinc-500 text-sm">Verifying reset link…</p>
            </div>
          )}

          {/* Error: link invalid or expired */}
          {pageState === "error" && (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">⏰</div>
              <h2 className="text-white font-semibold mb-2">Link expired or invalid</h2>
              <p className="text-zinc-400 text-sm mb-5">
                Password reset links expire after 1 hour. Please request a new one.
              </p>
              <button
                onClick={() => router.push("/auth/forgot-password")}
                className="btn-primary w-full"
              >
                Request New Link
              </button>
            </div>
          )}

          {/* Success */}
          {pageState === "success" && (
            <motion.div
              className="text-center py-4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="text-3xl mb-3">🎉</div>
              <h2 className="text-white font-semibold mb-2">Password updated!</h2>
              <p className="text-zinc-400 text-sm">Redirecting you to sign in…</p>
            </motion.div>
          )}

          {/* Ready: show form */}
          {pageState === "ready" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {errorMsg && (
                <motion.div
                  className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {errorMsg}
                </motion.div>
              )}

              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showPw ? "text" : "password"}
                    className="input-base pl-10 pr-10"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type={showPw ? "text" : "password"}
                    className="input-base pl-10"
                    placeholder="Repeat your new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                {confirmPw && password !== confirmPw && (
                  <p className="text-red-400 text-xs">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || password !== confirmPw || password.length < 8}
                className="btn-primary h-11 flex items-center justify-center gap-2 mt-1"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
