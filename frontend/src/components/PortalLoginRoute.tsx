import { Navigate } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useCaregiverStore } from "@/store/useCaregiverStore";

type PortalRole = "admin" | "user" | "caregiver";

const portalRedirects: Record<PortalRole, string> = {
  admin: "/admin/dashboard",
  user: "/home",
  caregiver: "/caregiver/dashboard",
};

export default function PortalLoginRoute({
  role,
  children,
}: {
  role: PortalRole;
  children: React.ReactNode;
}) {
  const { token, user } = useStore();
  const { token: adminToken, user: adminUser } = useAdminStore();
  const { token: caregiverToken, user: caregiverUser } = useCaregiverStore();

  if (role === "caregiver") {
    if (caregiverToken && caregiverUser?.role === "caregiver") {
      return <Navigate to={portalRedirects.caregiver} replace />;
    }

    return <>{children}</>;
  }

  if (role === "admin") {
    if (adminToken && adminUser?.role === "admin") {
      return <Navigate to={portalRedirects.admin} replace />;
    }
    return <>{children}</>;
  }

  if (token && user?.role === "user") {
    return <Navigate to={portalRedirects[role]} replace />;
  }

  return <>{children}</>;
}
