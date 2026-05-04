import { Link, useLocation } from "react-router-dom";
import { useStore } from "@/store/useStore";
import { useAuth } from "@/hooks/useAuth";
import { useAdminStore } from "@/store/useAdminStore";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Heart, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function Navbar() {
  const location = useLocation();
  const { token: patientToken, user: patientUser } = useStore();
  const { token: adminToken, user: adminUser } = useAdminStore();
  const { logout: patientLogout } = useAuth();
  const { logout: adminLogout } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const isAdminRoute = location.pathname.startsWith("/admin");
  const token = isAdminRoute ? adminToken : patientToken;
  const user = isAdminRoute ? adminUser : patientUser;
  const logout = isAdminRoute ? adminLogout : patientLogout;
  const isAdmin = isAdminRoute && user?.role === "admin";

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="container mx-auto flex min-h-[72px] items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
            <Heart className="h-5 w-5 fill-white" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-[0.22em] text-cyan-700">APNACARE</div>
            <div className="text-sm text-slate-500">{isAdmin ? "Admin control workspace" : "Patient portal and care booking"}</div>
          </div>
        </Link>

        <div className="hidden items-center gap-4 md:flex">
          {token ? (
            <>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
                <ShieldCheck className="h-4 w-4" />
                {isAdmin ? "Admin Portal" : "Patient Portal"}
              </div>
              {isAdmin ? (
                <Link to="/admin/dashboard" className="text-slate-500 transition-colors hover:text-slate-950">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/home" className="text-slate-500 transition-colors hover:text-slate-950">
                    Home
                  </Link>
                  <Link to="/booking" className="text-slate-500 transition-colors hover:text-slate-950">
                    Book
                  </Link>
                  <Link to="/profile" className="text-slate-500 transition-colors hover:text-slate-950">
                    My Profile
                  </Link>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="mr-1 h-4 w-4" /> Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="sm" className="rounded-full px-5">
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t bg-white px-4 pb-4 md:hidden">
          {token ? (
            <>
              {isAdmin ? (
                <Link to="/admin/dashboard" onClick={() => setOpen(false)} className="block py-2 text-slate-600">
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/home" onClick={() => setOpen(false)} className="block py-2 text-slate-600">
                    Home
                  </Link>
                  <Link to="/booking" onClick={() => setOpen(false)} className="block py-2 text-slate-600">
                    Book
                  </Link>
                  <Link to="/profile" onClick={() => setOpen(false)} className="block py-2 text-slate-600">
                    My Profile
                  </Link>
                </>
              )}
              <button
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
                className="block py-2 text-destructive"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="block py-2">
                Login
              </Link>
              <Link to="/signup" onClick={() => setOpen(false)} className="block py-2">
                Sign Up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
