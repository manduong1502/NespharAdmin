import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest, getStoredToken, setStoredToken } from "../api/client";
import { PermissionKey, StaffUser } from "../types";

interface AuthContextValue {
  staff: StaffUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: PermissionKey) => boolean;
  toast: { message: string; tone: "positive" | "negative" } | null;
  showToast: (message: string, tone?: "positive" | "negative") => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{ message: string; tone: "positive" | "negative" } | null>(
    null
  );

  const showToast = useCallback(
    (message: string, tone: "positive" | "negative" = "positive") => {
      setToast({ message, tone });
      window.setTimeout(() => {
        setToast((prev) => (prev?.message === message ? null : prev));
      }, 3200);
    },
    []
  );

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiRequest<{ staff: StaffUser }>("/auth/me")
      .then((res) => {
        setStaff(res.staff);
      })
      .catch(() => {
        setStoredToken("");
        setStaff(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ token: string; staff: StaffUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setStaff(res.staff);
    showToast(`Xin chào ${res.staff.fullName}`);
  };

  const logout = () => {
    setStoredToken("");
    setStaff(null);
  };

  const hasPermission = useCallback(
    (perm: PermissionKey) => {
      if (!staff) return false;
      return staff.role === "ADMIN" || staff.permissions.includes(perm);
    },
    [staff]
  );

  return (
    <AuthContext.Provider
      value={{ staff, loading, login, logout, hasPermission, toast, showToast }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
