"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Always show success to prevent email enumeration
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Reset Password</h1>
          <p className="text-zinc-400 text-sm">Enter your email and we&apos;ll send a reset link</p>
        </div>

        <div className="glass-strong rounded-2xl p-8 shadow-glass">
          {sent ? (
            <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="text-3xl mb-3">📬</div>
              <p className="text-zinc-300 text-sm">
                If <span className="text-penda-400">{email}</span> has an account, a reset link is on its way.
              </p>
              <Link href="/auth/login">
                <button className="btn-primary w-full mt-5">Back to Sign In</button>
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    className="input-base pl-10"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary h-11 flex items-center justify-center">
                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Send Reset Link"}
              </button>
              <p className="text-center text-zinc-500 text-sm">
                <Link href="/auth/login" className="text-penda-400 hover:text-penda-300">
                  ← Back to Sign In
                </Link>
              </p>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
