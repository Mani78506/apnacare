import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Mail, ShieldCheck } from "lucide-react";
import PortalLoginShell from "@/components/PortalLoginShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authAPI } from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword({ email, role: "user" });
      toast.success("If the account exists, a reset link has been sent.");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLoginShell
      portalLabel="Patient Portal"
      portalBadgeIcon={ShieldCheck}
      heroIcon={Heart}
      heroTitle="Reset patient access without leaving the portal."
      heroDescription="Enter the patient account email and ApnaCare will send a secure reset link."
      formIcon={Heart}
      formTitle="Forgot password"
      formDescription="Reset your ApnaCare patient account password"
      compactDesktop
      footer={
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Back to{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            patient login
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Patient Email</Label>
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
        <Button type="submit" className="h-11 w-full rounded-xl text-sm" disabled={loading}>
          {loading ? "Sending reset link..." : "Send reset link"}
        </Button>
      </form>
    </PortalLoginShell>
  );
}
