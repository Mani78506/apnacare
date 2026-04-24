import { create } from "zustand";
import { CAREGIVER_TOKEN_KEY, CAREGIVER_USER_KEY, clearCaregiverSession, getStoredCaregiverUser } from "@/lib/session";

export interface CaregiverUser {
  id: number;
  name: string;
  email: string;
  role: string;
  caregiver_id?: number | null;
  caregiver_status?: "pending" | "approved" | "rejected" | null;
  caregiver_verified?: boolean | null;
}

export interface BookingSummary {
  id: number;
  user_id: number;
  caregiver_id: number;
  patient_id: number;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_condition?: string | null;
  status: string;
  payment_method?: string | null;
  payment_status?: string | null;
  amount?: number | null;
  service_type?: string | null;
  notes?: string | null;
  duration_type?: string | null;
  hours?: number | null;
  days?: number | null;
  months?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  otp_verified?: boolean;
  face_verified?: boolean;
  face_verification_status?: string | null;
  manual_override?: boolean;
  arrival_selfie_id?: number | null;
  qr_code_path?: string | null;
  prescription_file_name?: string | null;
  has_prescription?: boolean;
}

interface LocationPoint {
  lat: number;
  lng: number;
}

interface CaregiverState {
  token: string | null;
  user: CaregiverUser | null;
  caregiverId: number | null;
  currentBooking: BookingSummary | null;
  liveLocation: LocationPoint | null;
  setSession: (token: string, user: CaregiverUser) => void;
  setUser: (user: CaregiverUser | null) => void;
  setCurrentBooking: (booking: BookingSummary | null) => void;
  setLiveLocation: (location: LocationPoint | null) => void;
  logout: () => void;
}

const parsedUser = (getStoredCaregiverUser() as CaregiverUser | null) ?? null;

export const useCaregiverStore = create<CaregiverState>((set) => ({
  token: localStorage.getItem(CAREGIVER_TOKEN_KEY),
  user: parsedUser,
  caregiverId: parsedUser?.caregiver_id ?? null,
  currentBooking: null,
  liveLocation: null,
  setSession: (token, user) => {
    localStorage.setItem(CAREGIVER_TOKEN_KEY, token);
    localStorage.setItem(CAREGIVER_USER_KEY, JSON.stringify(user));
    set({ token, user, caregiverId: user.caregiver_id ?? null });
  },
  setUser: (user) => {
    if (user) {
      localStorage.setItem(CAREGIVER_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CAREGIVER_USER_KEY);
    }
    set({ user, caregiverId: user?.caregiver_id ?? null });
  },
  setCurrentBooking: (currentBooking) => set({ currentBooking }),
  setLiveLocation: (liveLocation) => set({ liveLocation }),
  logout: () => {
    clearCaregiverSession();
    set({ token: null, user: null, caregiverId: null, currentBooking: null, liveLocation: null });
  },
}));
