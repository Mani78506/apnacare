import { create } from "zustand";
import { clearSharedSession, getStoredSharedUser, readSessionValue, setSessionValue, removeSessionValue, SHARED_TOKEN_KEY, SHARED_USER_KEY } from "@/lib/session";

interface User {
  id?: number;
  name: string;
  email: string;
  role?: string;
}

interface CaregiverLocation {
  lat: number;
  lng: number;
}

type BookingStatus = "pending" | "assigned" | "accepted" | "on_the_way" | "arrived" | "started" | "completed" | "rejected";

interface AppState {
  user: User | null;
  token: string | null;
  bookingId: string | null;
  caregiverLocation: CaregiverLocation | null;
  bookingStatus: BookingStatus;
  eta: string | null;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setBookingId: (id: string | null) => void;
  setCaregiverLocation: (loc: CaregiverLocation | null) => void;
  setBookingStatus: (status: BookingStatus) => void;
  setETA: (eta: string | null) => void;
  logout: () => void;
}

const parsedUser = (getStoredSharedUser() as User | null) ?? null;

export const useStore = create<AppState>((set) => ({
  user: parsedUser,
  token: readSessionValue(SHARED_TOKEN_KEY),
  bookingId: null,
  caregiverLocation: null,
  bookingStatus: "pending",
  eta: null,

  setUser: (user) => {
    if (user) setSessionValue(SHARED_USER_KEY, JSON.stringify(user));
    else removeSessionValue(SHARED_USER_KEY);
    set({ user });
  },
  setToken: (token) => {
    if (token) setSessionValue(SHARED_TOKEN_KEY, token);
    else removeSessionValue(SHARED_TOKEN_KEY);
    set({ token });
  },
  setBookingId: (bookingId) => set({ bookingId }),
  setCaregiverLocation: (caregiverLocation) => set({ caregiverLocation }),
  setBookingStatus: (bookingStatus) => set({ bookingStatus }),
  setETA: (eta) => set({ eta }),
  logout: () => {
    clearSharedSession();
    set({ user: null, token: null, bookingId: null, caregiverLocation: null, bookingStatus: "pending", eta: null });
  },
}));
