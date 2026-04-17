import { useState } from "react";
import { Link } from "react-router-dom";
import { Clock3, Heart, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PortalLoginShell from "@/components/PortalLoginShell";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, error } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void login(email, password);
  };

  return (
    <PortalLoginShell
      portalLabel="Patient Portal"
      portalBadgeIcon={ShieldCheck}
      heroIcon={Heart}
      heroTitle="Manage home care with a calmer, more reliable patient experience."
      heroDescription="Sign in to book caregivers, follow arrivals in real time, and keep every care request organized in one place."
      formIcon={Heart}
      formTitle="Welcome back"
      formDescription="Sign in to your ApnaCare patient account"
      features={[
        {
          icon: Heart,
          eyebrow: "Trusted care",
          description: "Book verified caregivers for elder care, recovery support, and in-home patient assistance.",
          tone: "dark",
        },
        {
          icon: Clock3,
          eyebrow: "Live visibility",
          description: "Track caregiver progress after booking so families know exactly when support is arriving.",
          tone: "light",
        },
      ]}
      compactDesktop
      footer={
        <>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create one
            </Link>
          </p>
          <p className="mt-3 text-center text-xs uppercase tracking-[0.22em] text-slate-400">
            Admin and caregiver access use separate portals
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="h-11 rounded-xl border-slate-200 pl-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              className="h-11 rounded-xl border-slate-200 pl-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <Button type="submit" className="h-11 w-full rounded-xl text-sm" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </PortalLoginShell>
  );
}
