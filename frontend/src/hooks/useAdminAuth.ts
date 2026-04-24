import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "sonner";
import { authAPI } from "@/lib/api";
import { setLastActivePortal } from "@/lib/session";
import { useAdminStore } from "@/store/useAdminStore";

export function useAdminAuth() {
  const navigate = useNavigate();
  const { setUser, setToken, logout, token } = useAdminStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adminLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authAPI.login({ email, password, expected_role: "admin" });
      if (res.data.user.role !== "admin") {
        throw new Error("This login is only for admin access.");
      }
      setToken(res.data.token);
      setUser(res.data.user);
      setLastActivePortal("admin");
      toast.success("Admin session opened.");
      navigate("/admin/dashboard", { replace: true });
    } catch (err: any) {
      const message = err.response?.data?.detail || err.message || "Unable to sign in.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return { adminLogin, logout: handleLogout, loading, error, isAuthenticated: !!token };
}
