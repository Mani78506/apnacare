import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authAPI } from "@/lib/api";
import { setLastActivePortal } from "@/lib/session";
import { CaregiverUser, useCaregiverStore } from "@/store/useCaregiverStore";

export function useCaregiverAuth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, caregiverId, setSession, logout } = useCaregiverStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = useMemo(() => Boolean(token && user?.role === "caregiver"), [token, user]);

  useEffect(() => {
    if (!loading && !isAuthenticated && location.pathname !== "/caregiver/login") {
      navigate("/caregiver/login", { replace: true });
    }
  }, [isAuthenticated, loading, location.pathname, navigate]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authAPI.login({ email, password, expected_role: "caregiver" });
      const nextUser = response.data.user as CaregiverUser;
      if (nextUser.role !== "caregiver") {
        throw new Error("This login is only for caregivers.");
      }

      setSession(response.data.token, nextUser);
      setLastActivePortal("caregiver");
      navigate("/caregiver/dashboard", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = () => {
    logout();
    navigate("/caregiver/login", { replace: true });
  };

  return {
    token,
    user,
    caregiverId,
    isAuthenticated,
    loading,
    error,
    login,
    logout: signOut,
  };
}
