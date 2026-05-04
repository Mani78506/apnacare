import { Link, useLocation } from "react-router-dom";
import { Bell, ClipboardList, MapPinned, Route, ShieldCheck } from "lucide-react";
import { useCaregiverStore } from "@/store/useCaregiverStore";

type WorkspaceView = "overview" | "history" | "notifications" | "profile";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  showWorkspace?: boolean;
  workspaceView?: WorkspaceView;
  onWorkspaceChange?: (view: WorkspaceView) => void;
}

export default function Sidebar({
  open,
  onClose,
  showWorkspace = false,
  workspaceView = "overview",
  onWorkspaceChange,
}: SidebarProps) {
  const location = useLocation();
  const { currentBooking, user } = useCaregiverStore();
  const caregiverBadge =
    user?.caregiver_status === "approved"
      ? { label: "Verified", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" }
      : user?.caregiver_status === "rejected"
        ? { label: "Rejected", tone: "border-rose-200 bg-rose-50 text-rose-700" }
        : { label: "Under Review", tone: "border-amber-200 bg-amber-50 text-amber-700" };

  const links = [
    {
      to: "/caregiver/dashboard",
      label: "Dashboard",
      icon: ClipboardList,
      active: location.pathname === "/caregiver/dashboard" && workspaceView === "overview",
    },
    {
      to: currentBooking && user?.caregiver_status === "approved" ? `/caregiver/job/${currentBooking.id}` : "/caregiver/dashboard",
      label: "Jobs",
      icon: Route,
      active: location.pathname.startsWith("/caregiver/job/"),
    },
    {
      to: "/caregiver/profile",
      label: "My Profile",
      icon: ShieldCheck,
      active: location.pathname === "/caregiver/profile",
    },
  ];

  const dashboardPanels = [
    {
      key: "history" as const,
      label: "Job History",
      icon: MapPinned,
      active: workspaceView === "history",
    },
    {
      key: "notifications" as const,
      label: "Notifications",
      icon: Bell,
      active: workspaceView === "notifications",
    },
    {
      key: "profile" as const,
      label: "Profile & Performance",
      icon: ShieldCheck,
      active: workspaceView === "profile",
    },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/40 transition-opacity md:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white px-5 py-6 transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-950">ApnaCare</p>
            <p className="text-sm text-slate-500">Caregiver Console</p>
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-950">{user?.name ?? "Caregiver"}</p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${caregiverBadge.tone}`}>
            {caregiverBadge.label}
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.label}
                to={link.to}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  link.active ? "bg-cyan-50 text-cyan-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
                onClick={onClose}
                onClickCapture={() => {
                  if (link.to === "/caregiver/dashboard") {
                    onWorkspaceChange?.("overview");
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}

          {showWorkspace ? (
            <div className="mt-6 space-y-2 border-t border-slate-200 pt-6">
              <p className="px-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
              {dashboardPanels.map((panel) => {
                const Icon = panel.icon;
                return (
                  <button
                    type="button"
                    key={panel.label}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                      panel.active ? "bg-cyan-50 text-cyan-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    onClick={() => {
                      onWorkspaceChange?.(panel.key);
                      onClose();
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    {panel.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
