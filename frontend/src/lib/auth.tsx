"use client";

import { mockApi } from "@/lib/mock/api";
import type { AuthUser, Role } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "epic-cure-auth";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  switchRole: (role: Role) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as AuthUser);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: AuthUser | null) => {
    setUser(next);
    if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const next = await mockApi.login(email, password);
      persist(next);
      return next;
    },
    [persist],
  );

  const logout = useCallback(() => persist(null), [persist]);

  const switchRole = useCallback(
    (role: Role) => {
      if (!user) return;
      persist({ ...user, role });
    },
    [persist, user],
  );

  const value = useMemo(
    () => ({ user, ready, login, logout, switchRole }),
    [user, ready, login, logout, switchRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function roleLabel(role: Role) {
  switch (role) {
    case "warehouse_staff":
      return "Warehouse staff";
    case "doctor":
      return "Program clinician";
    case "admin":
      return "Program director";
    case "community_partner":
      return "Community partner";
    case "client":
      return "Client";
  }
}
