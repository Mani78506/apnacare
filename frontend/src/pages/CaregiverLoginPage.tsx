import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ClipboardList, Lock, Mail, Radio, ShieldCheck } from "lucide-react";
import { useCaregiverAuth } from "@/hooks/useCaregiverAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PortalLoginShell from "@/components/PortalLoginShell";

export default function CaregiverLoginPage() {
  const { login, loading, error } = useCaregiverAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await login(email, password);
  };

  return (
    <PortalLoginShell
      portalLabel="Caregiver Hub"
      portalBadgeIcon={ShieldCheck}
      heroIcon={Activity}
      heroTitle="Caregiver dispatch built for urgent, high-trust care delivery."
      heroDescription="Sign in to review assigned jobs, start routes, share live location, and keep families updated in real time."
      formIcon={Activity}
      formTitle="Start your shift"
      formDescription="Sign in to the ApnaCare caregiver workspace"
      features={[
        {
          icon: ClipboardList,
          eyebrow: "Job queue",
          description: "Review assigned visits, manage acceptance, and stay aligned with the live dispatch queue.",
          tone: "dark",
        },
        {
          icon: Radio,
          eyebrow: "Live ops",
          description: "Share location, update route status, and keep every visit milestone visible while you are in the field.",
          tone: "light",
        },
      ]}
      compactDesktop
      footer={
        <p className="mt-5 text-center text-xs uppercase tracking-[0.22em] text-slate-400">
          Only approved caregiver accounts can open this workspace
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Caregiver Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="caregiver@apnacare.com"
              className="h-12 rounded-2xl border-slate-200 pl-10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              className="h-12 rounded-2xl border-slate-200 pl-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <div className="text-right">
            <Link to="/caregiver/forgot-password" className="text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={loading}>
          {loading ? "Signing in..." : "Open Caregiver Dashboard"}
        </Button>
      </form>
    </PortalLoginShell>
  );
}
