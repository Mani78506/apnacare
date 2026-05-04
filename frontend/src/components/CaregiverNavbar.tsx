import { Bell, LogOut, MapPinned, Menu } from "lucide-react";
import { Link } from "react-router-dom";

interface NavbarProps {
  title: string;
  subtitle: string;
  onMenuClick?: () => void;
  onLogout?: () => void;
}

export default function CaregiverNavbar({ title, subtitle, onMenuClick, onLogout }: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 md:hidden"
            onClick={onMenuClick}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-700">ApnaCare Caregiver</p>
            <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 md:flex">
            <MapPinned className="h-4 w-4" />
            Live operations
          </div>
          <Link
            to="/caregiver/profile"
            className="hidden h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 md:inline-flex"
          >
            My Profile
          </Link>
          <button type="button" className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 md:inline-flex">
            <Bell className="h-4 w-4" />
          </button>
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
