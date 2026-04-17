import { Navigate } from "react-router-dom";
import { useStore } from "@/store/useStore";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useStore();
  if (!token || user?.role !== "user") return <Navigate to="/login" replace />;
  return <>{children}</>;
}
