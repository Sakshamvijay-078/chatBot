"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Sparkles, Mail, Lock, User, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (authError) throw new Error(authError.message);
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="auth-page">
        <motion.div
          className="auth-card text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-4"
            style={{ background: "rgba(200,243,29,0.12)", border: "1px solid rgba(200,243,29,0.3)" }}>
            <CheckCircle className="w-7 h-7" style={{ color: "var(--lime)" }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Check your email</h2>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            We sent a confirmation link to{" "}
            <span style={{ color: "var(--lime)" }}>{email}</span>.
            Click it to activate your account.
          </p>
          <Link href="/auth/login">
            <button className="btn-lime w-full" style={{ borderRadius: "var(--radius-md)" }}>
              Back to Sign In
            </button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl"
          style={{ background: "rgba(200, 243, 29, 0.05)", animation: "limePulse 4s ease-in-out infinite" }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl"
          style={{ background: "rgba(200, 243, 29, 0.03)", animation: "limePulse 4s ease-in-out infinite 1.5s" }} />
      </div>

      <motion.div
        className="w-full max-w-md z-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "var(--lime)" }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Sparkles className="w-7 h-7 text-[#0A0A0A]" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Create your account</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Start using Penda for free</p>
        </div>

        <div className="auth-card">
          {error && (
            <motion.div
              className="mb-5 px-4 py-3 rounded-lg text-sm"
              style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#f87171",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full name */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fullname" className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}>
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-tertiary)" }} />
                <input
                  id="fullname"
                  type="text"
                  className="input-base pl-10"
                  placeholder="Jane Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}>
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-tertiary)" }} />
                <input
                  id="email"
                  type="email"
                  className="input-base pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}>
                Password <span className="normal-case font-normal" style={{ color: "var(--border-strong)" }}>(min. 8 chars)</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--text-tertiary)" }} />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  className="input-base pl-10 pr-10"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength bar */}
              {password.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        background:
                          i < Math.min(4, Math.floor(password.length / 3))
                            ? password.length < 8
                              ? "#f59e0b"
                              : "var(--lime)"
                            : "var(--bg-elevated)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              className="w-full mt-2 btn-lime flex items-center justify-center gap-2"
              style={{ borderRadius: "var(--radius-md)", height: 44 }}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: "var(--text-tertiary)" }}>
            Already have an account?{" "}
            <Link href="/auth/login"
              className="font-medium transition-colors"
              style={{ color: "var(--lime)" }}>
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
