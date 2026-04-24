import { useNavigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { authAPI } from "@/lib/api";
import { setLastActivePortal } from "@/lib/session";
import { useState } from "react";
import { toast } from "sonner";

export function useAuth() {
  const { setUser, setToken, logout, token, user } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authAPI.login({ email, password, expected_role: "user" });
      if (res.data.user.role === "caregiver") {
        throw new Error("Please use the caregiver portal.");
      }
      if (res.data.user.role === "admin") {
        throw new Error("Please use the admin portal.");
      }
      setToken(res.data.token);
      setUser(res.data.user);
      setLastActivePortal("user");
      toast.success("Welcome back!");
      navigate("/home");
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || "Login failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const signup = async (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role?: "user" | "caregiver";
    location?: string;
    address?: string;
    gender?: "male" | "female" | "other";
    latitude?: number;
    longitude?: number;
    skills?: string[];
    experience?: number;
    profile_photo?: { file_name: string; content_type?: string; file_data: string };
    id_proof?: { file_name: string; content_type?: string; file_data: string };
    certificate?: { file_name: string; content_type?: string; file_data: string };
  }) => {
    setLoading(true);
    setError(null);
    try {
      await authAPI.signup(data);
      const isCaregiver = data.role === "caregiver";
      toast.success(isCaregiver ? "Caregiver onboarding submitted. Please sign in." : "Account created! Please login.");
      navigate(isCaregiver ? "/caregiver/login" : "/login");
    } catch (err: any) {
      const message = err.response?.data?.detail || "Signup failed";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return { login, signup, logout: handleLogout, loading, error, isAuthenticated: !!token };
}
