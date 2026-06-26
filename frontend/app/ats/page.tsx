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
          background: "#09090b",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Top nav bar */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(9,9,11,0.95)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div className="flex items-center gap-3">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition-colors text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Chat
            </Link>
            <span className="text-zinc-700">·</span>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              >
                <Users className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">ATS Dashboard</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-medium text-zinc-400">Penda AI</span>
          </div>
        </header>

        {/* Main dashboard — takes remaining height */}
        <div className="flex-1 overflow-hidden">
          <ATSDashboard />
        </div>
      </div>
    </AuthGuard>
  );
}
