import { useState } from "react";
import { BadgeCheck, Building2, Lock, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PortalLoginShell from "@/components/PortalLoginShell";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { adminLogin, loading, error } = useAdminAuth();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await adminLogin(email, password);
  };

  return (
    <PortalLoginShell
      portalLabel="Admin Access"
      portalBadgeIcon={ShieldCheck}
      heroIcon={Building2}
      heroTitle="Review caregiver trust, approvals, and platform quality in one control room."
      heroDescription="Sign in to verify caregiver applications, approve trusted providers, and keep marketplace operations reliable."
      formIcon={Building2}
      formTitle="Admin control"
      formDescription="Only admin accounts can sign in on this screen"
      compactDesktop
      features={[
        {
          icon: ShieldAlert,
          eyebrow: "Trust review",
          description: "Review applications, documents, and readiness signals before new caregivers go live.",
          tone: "dark",
        },
        {
          icon: BadgeCheck,
          eyebrow: "Approval control",
          description: "Approve verified providers, reject incomplete submissions, and keep the platform trust layer clean.",
          tone: "light",
        },
      ]}
      footer={
        <>
          <p className="mt-5 text-center text-sm text-slate-500">
            This screen accepts admin accounts only. Patient and caregiver accounts use separate portals.
          </p>
          <p className="mt-3 text-center text-xs uppercase tracking-[0.22em] text-slate-400">
            Restricted platform review access
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Admin Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="admin@apnacare.com"
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
        </div>
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={loading}>
          {loading ? "Signing in..." : "Open Admin Dashboard"}
        </Button>
      </form>
    </PortalLoginShell>
  );
}
