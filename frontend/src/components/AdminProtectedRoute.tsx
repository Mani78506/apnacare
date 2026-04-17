import { Navigate } from "react-router-dom";
import { useAdminStore } from "@/store/useAdminStore";

export default function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAdminStore();

  if (!token || user?.role !== "admin") return <Navigate to="/admin/login" replace />;

  return <>{children}</>;
}
