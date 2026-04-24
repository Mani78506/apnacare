import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import PortalLoginShell from "@/components/PortalLoginShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authAPI } from "@/lib/api";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const token = searchParams.get("token") ?? "";

  const hasToken = useMemo(() => Boolean(token.trim()), [token]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasToken) {
      toast.error("Reset link is invalid.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ token, new_password: password });
      toast.success("Password reset successful. Please sign in.");
      navigate("/login", { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PortalLoginShell
      portalLabel="Password Reset"
      portalBadgeIcon={ShieldCheck}
      heroIcon={KeyRound}
      heroTitle="Set a new password and return to ApnaCare securely."
      heroDescription="Use the secure reset link from your email to create a fresh password for your account."
      formIcon={KeyRound}
      formTitle="Reset password"
      formDescription="Create a new ApnaCare password"
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
      {!hasToken ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Reset link is invalid or missing.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="Enter a new password"
                className="h-11 rounded-xl border-slate-200 pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter the new password"
                className="h-11 rounded-xl border-slate-200 pl-10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>
          <Button type="submit" className="h-11 w-full rounded-xl text-sm" disabled={loading}>
            {loading ? "Resetting password..." : "Reset password"}
          </Button>
        </form>
      )}
    </PortalLoginShell>
  );
}
