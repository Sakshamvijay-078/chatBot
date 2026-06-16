"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Root page — redirects to /chat if logged in, else to /auth/login.
 */
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/chat" : "/auth/login");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full bg-penda-gradient animate-pulse-slow" />
        <p className="text-zinc-500 text-sm">Loading Penda…</p>
      </div>
    </div>
  );
}
