"use client";

/**
 * AuthContext.tsx
 * Wraps the entire app with Supabase auth state.
 * Provides: user, session, profile, loading, signOut, refreshProfile
 *
 * Fix: Added hasFetched ref to prevent the infinite GET /profile loop
 * that occurred when onAuthStateChange fired multiple times.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getProfile } from "@/lib/api";
import { Profile } from "@/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Prevent duplicate profile fetches when auth state fires multiple times
  const lastFetchedUserId = useRef<string | null>(null);

  const fetchProfile = useCallback(async (token: string, userId: string) => {
    // Skip if we already fetched for this user
    if (lastFetchedUserId.current === userId) return;
    lastFetchedUserId.current = userId;
    try {
      const p = await getProfile(token);
      setProfile(p);
    } catch {
      setProfile(null);
      // Reset so a retry is possible on next login
      lastFetchedUserId.current = null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token || !user?.id) return;
    // Force re-fetch by clearing the cache key
    lastFetchedUserId.current = null;
    await fetchProfile(session.access_token, user.id);
  }, [session, user, fetchProfile]);

  useEffect(() => {
    let initialised = false;

    // 1. Bootstrap from existing session (fast, reads local storage)
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s) {
        setSession(s);
        setUser(s.user);
        fetchProfile(s.access_token, s.user.id).finally(() => {
          if (!initialised) setLoading(false);
          initialised = true;
        });
      } else {
        setLoading(false);
        initialised = true;
      }
    });

    // 2. Listen for subsequent auth events (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.access_token && newSession.user) {
        fetchProfile(newSession.access_token, newSession.user.id).finally(() => {
          if (!initialised) {
            setLoading(false);
            initialised = true;
          }
        });
      } else {
        // Logged out
        setProfile(null);
        lastFetchedUserId.current = null;
        if (!initialised) {
          setLoading(false);
          initialised = true;
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    lastFetchedUserId.current = null;
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
