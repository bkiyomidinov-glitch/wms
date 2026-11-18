import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  apiRequest,
  clearStoredTokens,
  getStoredTokens,
  setStoredTokens,
} from "@/lib/api";
import type { TokenResponse, UserRole, UserSummary } from "@/types/api";

interface AuthContextValue {
  user: UserSummary | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    const { accessToken } = getStoredTokens();
    if (accessToken) {
      fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        keepalive: true,
      }).catch(() => {});
    }
    clearStoredTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener("wms:unauthorized", onUnauthorized);

    (async () => {
      const { accessToken } = getStoredTokens();
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await apiRequest<UserSummary>("/api/v1/auth/me");
        setUser(me);
      } catch {
        clearStoredTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => window.removeEventListener("wms:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiRequest<TokenResponse>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ username, password }),
      },
      false
    );
    setStoredTokens(data.access_token, data.refresh_token);
    setUser(data.user);
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
