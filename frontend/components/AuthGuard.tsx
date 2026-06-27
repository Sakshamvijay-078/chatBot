"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: "#0A0A0A" }}
      >
        <div className="flex flex-col items-center gap-4">
          {/* Dotted lime badge pulsing */}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center animate-pulse"
            style={{
              border: "1.5px dashed rgba(200,243,29,0.5)",
              background: "rgba(200,243,29,0.05)",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 800, color: "#C8F31D" }}>P</span>
          </div>
          <p className="text-[12px] tracking-widest uppercase" style={{ color: "#444" }}>
            Authenticating…
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
