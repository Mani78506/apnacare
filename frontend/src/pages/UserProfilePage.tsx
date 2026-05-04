import { useEffect, useState } from "react";
import { MapPin, Pencil, Save, UserRound } from "lucide-react";
import { toast } from "sonner";

import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { profileAPI, UserProfile } from "@/lib/api";
import { useStore } from "@/store/useStore";

type UserProfileForm = {
  name: string;
  phone: string;
  location: string;
  address: string;
  latitude: string;
  longitude: string;
};

const emptyForm: UserProfileForm = {
  name: "",
  phone: "",
  location: "",
  address: "",
  latitude: "",
  longitude: "",
};

function toForm(profile: UserProfile): UserProfileForm {
  return {
    name: profile.name || "",
    phone: profile.phone || "",
    location: profile.location || "",
    address: profile.address || "",
    latitude: profile.latitude == null ? "" : String(profile.latitude),
    longitude: profile.longitude == null ? "" : String(profile.longitude),
  };
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function UserProfilePage() {
  const { setUser } = useStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<UserProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await profileAPI.getUserProfile();
        setProfile(response.data);
        setForm(toForm(response.data));
      } catch (err: any) {
        setError(err.response?.data?.detail || "Unable to load profile.");
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await profileAPI.updateUserProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        address: form.address.trim(),
        latitude: nullableNumber(form.latitude),
        longitude: nullableNumber(form.longitude),
      });
      setProfile(response.data);
      setForm(toForm(response.data));
      setUser({
        id: response.data.id,
        name: response.data.name || "",
        email: response.data.email || "",
        role: response.data.role,
      });
      setEditing(false);
      toast.success("Profile updated successfully.");
    } catch (err: any) {
      const message = err.response?.data?.detail || "Unable to update profile.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)]">
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        <section className="mb-8 rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Patient Profile</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                {profile?.name || "My Profile"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">{profile?.email || "Manage patient contact and address details."}</p>
            </div>
            <Button className="rounded-full" onClick={() => setEditing((current) => !current)} disabled={loading}>
              <Pencil className="h-4 w-4" />
              {editing ? "Cancel Edit" : "Edit Profile"}
            </Button>
          </div>
        </section>

        {error ? <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        {loading ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
            Loading profile...
          </div>
        ) : profile ? (
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <Card className="rounded-[28px] border-slate-200 bg-white/90 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
              <CardHeader>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <UserRound className="h-7 w-7" />
                </div>
                <CardTitle className="text-2xl text-slate-950">{profile.name || "Patient"}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Detail label="Email" value={profile.email || "Not provided"} />
                <Detail label="Phone" value={profile.phone || "Not provided"} />
                <Detail label="Role" value={profile.role} />
                <Detail label="Created" value={profile.created_at ? new Date(profile.created_at).toLocaleString() : "Not available"} />
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-slate-200 bg-white/90 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                  <MapPin className="h-5 w-5 text-cyan-700" />
                  Contact and Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editing ? (
                  <div className="grid gap-4">
                    <Field label="Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                    <Field label="Phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
                    <Field label="Location" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Textarea value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Latitude" value={form.latitude} onChange={(value) => setForm((current) => ({ ...current, latitude: value }))} />
                      <Field label="Longitude" value={form.longitude} onChange={(value) => setForm((current) => ({ ...current, longitude: value }))} />
                    </div>
                    <Button className="w-fit rounded-full" onClick={() => void saveProfile()} disabled={saving}>
                      <Save className="h-4 w-4" />
                      {saving ? "Saving..." : "Save Profile"}
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Detail label="Location" value={profile.location || "Not provided"} />
                    <Detail label="Address" value={profile.address || "Not provided"} />
                    <Detail label="Latitude" value={profile.latitude == null ? "Not shared" : String(profile.latitude)} />
                    <Detail label="Longitude" value={profile.longitude == null ? "Not shared" : String(profile.longitude)} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-[14px] border-slate-200" />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{value}</p>
    </div>
  );
}
