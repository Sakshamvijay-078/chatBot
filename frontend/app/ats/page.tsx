"use client";

import AuthGuard from "@/components/AuthGuard";
import ATSDashboard from "@/components/ATSDashboard";
import Link from "next/link";
import { Sparkles, ArrowLeft, Users } from "lucide-react";

export default function ATSPage() {
  return (
    <AuthGuard>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-base)",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Top nav bar — consistent with chat page */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: "1px solid var(--border-hair)",
            background: "var(--bg-base)",
            minHeight: 52,
          }}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 transition-colors text-sm flex-shrink-0"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Chat</span>
            </Link>
            <span className="text-zinc-700 hidden sm:inline">·</span>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--lime)" }}
              >
                <Users className="w-3.5 h-3.5 text-[#0A0A0A]" />
              </div>
              <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                ATS Dashboard
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "var(--lime)" }}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0A0A0A]" />
            </div>
            <span className="text-sm font-medium hidden sm:inline" style={{ color: "var(--text-secondary)" }}>
              Penda AI
            </span>
          </div>
        </header>

        {/* Main dashboard — takes remaining height */}
        <div className="flex-1 overflow-hidden min-h-0">
          <ATSDashboard />
        </div>
      </div>
    </AuthGuard>
  );
}
