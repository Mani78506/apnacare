import { Navigate } from "react-router-dom";
import { useCaregiverStore } from "@/store/useCaregiverStore";

export default function CaregiverProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useCaregiverStore();

  if (!token || user?.role !== "caregiver") {
    return <Navigate to="/caregiver/login" replace />;
  }

  return <>{children}</>;
}
