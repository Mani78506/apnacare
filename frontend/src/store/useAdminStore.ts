import { create } from "zustand";
import { ADMIN_TOKEN_KEY, ADMIN_USER_KEY, clearAdminSession, getStoredAdminUser, readSessionValue, removeSessionValue, setSessionValue } from "@/lib/session";

interface AdminUser {
  id?: number;
  name: string;
  email: string;
  role?: string;
}

interface AdminState {
  user: AdminUser | null;
  token: string | null;
  setUser: (user: AdminUser | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

const parsedUser = (getStoredAdminUser() as AdminUser | null) ?? null;

export const useAdminStore = create<AdminState>((set) => ({
  user: parsedUser,
  token: readSessionValue(ADMIN_TOKEN_KEY),
  setUser: (user) => {
    if (user) setSessionValue(ADMIN_USER_KEY, JSON.stringify(user));
    else removeSessionValue(ADMIN_USER_KEY);
    set({ user });
  },
  setToken: (token) => {
    if (token) setSessionValue(ADMIN_TOKEN_KEY, token);
    else removeSessionValue(ADMIN_TOKEN_KEY);
    set({ token });
  },
  logout: () => {
    clearAdminSession();
    set({ user: null, token: null });
  },
}));
