/**
 * useKeepAlive.ts
 *
 * Pings the backend /ping endpoint every 5 minutes while the user has an
 * active session. This prevents the Render free-tier instance from spinning
 * down during an active user session (Render sleeps after ~15 min of no traffic).
 *
 * Usage: call useKeepAlive() in any component that is always mounted when
 * the user is logged in (e.g. the main chat layout).
 */

"use client";

import { useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useKeepAlive(enabled = true) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const ping = async () => {
      try {
        await fetch(`${API_URL}/ping`, { method: "GET", cache: "no-store" });
      } catch {
        // Silently swallow — network errors don't matter here
      }
    };

    // Ping immediately on mount to wake a sleeping instance as fast as possible
    ping();

    intervalRef.current = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);
}
