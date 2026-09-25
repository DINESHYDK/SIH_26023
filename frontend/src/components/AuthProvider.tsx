"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getCurrentUser } from "@/lib/api";
import type { AuthResponse, SafeUser } from "@/lib/report-types";

const SESSION_STORAGE_KEY = "cmpdi-georeport-session";

interface StoredSession {
  token: string;
  user: SafeUser;
}

interface AuthContextValue {
  user: SafeUser | null;
  token: string | null;
  isReady: boolean;
  isAuthenticated: boolean;
  startSession: (response: AuthResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): StoredSession | null {
  try {
    const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawSession) return null;

    const session = JSON.parse(rawSession) as StoredSession;
    if (!session.token || !session.user) return null;
    return session;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const startSession = useCallback((response: AuthResponse) => {
    const session: StoredSession = { token: response.token, user: response.user };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    setToken(session.token);
    setUser(session.user);
  }, []);

  useEffect(() => {
    const storedSession = readStoredSession();
    if (!storedSession) {
      setIsReady(true);
      return;
    }

    setToken(storedSession.token);
    setUser(storedSession.user);

    void getCurrentUser(storedSession.token)
      .then(({ user: currentUser }) => {
        const refreshedSession: StoredSession = { token: storedSession.token, user: currentUser };
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(refreshedSession));
        setUser(currentUser);
      })
      .catch(() => {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setIsReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isReady,
      isAuthenticated: Boolean(token && user),
      startSession,
      signOut,
    }),
    [isReady, signOut, startSession, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
