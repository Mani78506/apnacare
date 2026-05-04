import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileText, Image as ImageIcon, MapPinned, Pencil, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import CaregiverNavbar from "@/components/CaregiverNavbar";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CaregiverDocumentSummary, CaregiverProfile, getCaregiverDocumentUrl, profileAPI } from "@/lib/api";
import { useCaregiverAuth } from "@/hooks/useCaregiverAuth";
import { useCaregiverStore } from "@/store/useCaregiverStore";

type CaregiverProfileForm = {
  name: string;
  phone: string;
  location: string;
  address: string;
  gender: string;
  skills: string;
  experience: string;
  latitude: string;
  longitude: string;
};

const emptyForm: CaregiverProfileForm = {
  name: "",
  phone: "",
  location: "",
  address: "",
  gender: "",
  skills: "",
  experience: "",
  latitude: "",
  longitude: "",
};

function toForm(profile: CaregiverProfile): CaregiverProfileForm {
  return {
    name: profile.name || "",
    phone: profile.phone || "",
    location: profile.location || "",
    address: profile.address || "",
    gender: profile.gender || "",
    skills: profile.skills?.join(", ") || "",
    experience: profile.experience == null ? "" : String(profile.experience),
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

export default function CaregiverProfilePage() {
  const { logout } = useCaregiverAuth();
  const { user, setUser } = useCaregiverStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState<CaregiverProfile | null>(null);
  const [form, setForm] = useState<CaregiverProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await profileAPI.getCaregiverProfile();
        setProfile(response.data);
        setForm(toForm(response.data));
      } catch (err: any) {
        setError(err.response?.data?.detail || "Unable to load caregiver profile.");
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, []);

  const documentsByType = useMemo(() => {
    const docs = profile?.documents ?? [];
    return {
      profile: docs.find((doc) => doc.document_type === "profile" || doc.document_type === "profile_photo") ?? null,
      id: docs.find((doc) => doc.document_type === "id" || doc.document_type === "id_proof") ?? null,
      certificate: docs.find((doc) => doc.document_type === "certificate") ?? null,
    };
  }, [profile?.documents]);

  const saveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await profileAPI.updateCaregiverProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        address: form.address.trim(),
        gender: form.gender.trim(),
        skills: form.skills.split(",").map((item) => item.trim()).filter(Boolean),
        experience: nullableNumber(form.experience),
        latitude: nullableNumber(form.latitude),
        longitude: nullableNumber(form.longitude),
      });
      setProfile(response.data);
      setForm(toForm(response.data));
      setUser({
        id: user?.id ?? response.data.id,
        name: response.data.name || "",
        email: response.data.email || "",
        role: response.data.role,
        caregiver_id: response.data.id,
        caregiver_status: response.data.status as "pending" | "approved" | "rejected",
        caregiver_verified: response.data.is_verified,
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

  const updateCurrentLocation = () => {
    if (!navigator.geolocation) {
      const message = "Location permission denied. Please enable GPS/location access.";
      setError(message);
      toast.error(message);
      return;
    }

    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await profileAPI.updateCaregiverProfile({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: profile?.address || profile?.location || "Current location",
            location: profile?.location || profile?.address || "Current location",
          });
          setProfile(response.data);
          setForm(toForm(response.data));
          toast.success("Current location updated.");
        } catch (err: any) {
          const message = err.response?.data?.detail || "Unable to update current location.";
          setError(message);
          toast.error(message);
        } finally {
          setLocating(false);
        }
      },
      () => {
        const message = "Location permission denied. Please enable GPS/location access.";
        setError(message);
        toast.error(message);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)] text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen flex-1 flex-col">
          <CaregiverNavbar
            title="My Profile"
            subtitle="Manage caregiver details, service skills, and document visibility."
            onMenuClick={() => setSidebarOpen(true)}
            onLogout={logout}
          />
          <main className="flex-1 space-y-6 px-4 py-8 md:px-8">
            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Caregiver Profile</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {profile?.name || "My Profile"}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">{profile?.email || "Caregiver profile and documents."}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" className="rounded-full" onClick={updateCurrentLocation} disabled={loading || locating}>
                    <MapPinned className="h-4 w-4" />
                    {locating ? "Updating..." : "Update My Current Location"}
                  </Button>
                  <Button className="rounded-full" onClick={() => setEditing((current) => !current)} disabled={loading}>
                    <Pencil className="h-4 w-4" />
                    {editing ? "Cancel Edit" : "Edit Profile"}
                  </Button>
                </div>
              </div>
            </section>

            {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            {loading ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
                Loading caregiver profile...
              </div>
            ) : profile ? (
              <>
                <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                  <Card className="rounded-[28px] border-slate-200 bg-white/90 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
                    <CardHeader>
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                        <UserRound className="h-7 w-7" />
                      </div>
                      <CardTitle className="text-2xl text-slate-950">{profile.name || "Caregiver"}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      <Detail label="Email" value={profile.email || "Not provided"} />
                      <Detail label="Phone" value={profile.phone || "Not provided"} />
                      <Detail label="Gender" value={profile.gender || "Not provided"} />
                      <Detail label="Experience" value={profile.experience == null ? "Not provided" : `${profile.experience} years`} />
                      <Detail label="Rating" value={`${profile.rating ?? 0} / 5`} />
                      <Detail label="Availability" value={profile.is_available ? "Online" : "Offline"} />
                      <Detail label="Verification" value={profile.is_verified ? "Verified" : "Pending"} />
                      <Detail label="Status" value={profile.status.replaceAll("_", " ")} />
                    </CardContent>
                  </Card>

                  <Card className="rounded-[28px] border-slate-200 bg-white/90 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                        <ShieldCheck className="h-5 w-5 text-cyan-700" />
                        Skills and Location
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {editing ? (
                        <div className="grid gap-4">
                          <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Name" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
                            <Field label="Phone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
                            <Field label="Gender" value={form.gender} onChange={(value) => setForm((current) => ({ ...current, gender: value }))} />
                            <Field label="Experience" value={form.experience} onChange={(value) => setForm((current) => ({ ...current, experience: value }))} />
                            <Field label="Location" value={form.location} onChange={(value) => setForm((current) => ({ ...current, location: value }))} />
                            <Field label="Skills" value={form.skills} onChange={(value) => setForm((current) => ({ ...current, skills: value }))} />
                          </div>
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
                          <Detail label="Skills" value={profile.skills.length ? profile.skills.join(", ") : "No skills listed"} />
                          <Detail label="Location" value={profile.location || "Not provided"} />
                          <Detail label="Address" value={profile.address || "Not provided"} />
                          <Detail label="Latitude" value={profile.latitude == null ? "Not shared" : String(profile.latitude)} />
                          <Detail label="Longitude" value={profile.longitude == null ? "Not shared" : String(profile.longitude)} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-[28px] border-slate-200 bg-white/90 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                      <FileText className="h-5 w-5 text-cyan-700" />
                      Documents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 lg:grid-cols-3">
                    <DocumentCard title="Profile photo" document={documentsByType.profile} image />
                    <DocumentCard title="ID proof" document={documentsByType.id} />
                    <DocumentCard title="Certificate" document={documentsByType.certificate} />
                  </CardContent>
                </Card>
              </>
            ) : null}
          </main>
        </div>
      </div>
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
      <p className="mt-2 text-sm font-medium capitalize leading-6 text-slate-950">{value}</p>
    </div>
  );
}

function DocumentCard({ title, document, image = false }: { title: string; document: CaregiverDocumentSummary | null; image?: boolean }) {
  const url = document ? getCaregiverDocumentUrl(document.id) : null;
  const isImage = image || document?.content_type?.startsWith("image/");

  return (
    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isImage ? <ImageIcon className="h-4 w-4 text-cyan-700" /> : <FileText className="h-4 w-4 text-cyan-700" />}
          <p className="text-sm font-semibold text-slate-950">{title}</p>
        </div>
        {document ? <BadgeCheck className="h-4 w-4 text-emerald-600" /> : null}
      </div>
      {document && url ? (
        <>
          {isImage ? (
            <img src={url} alt={title} className="h-44 w-full rounded-[18px] border border-slate-200 bg-white object-cover" />
          ) : (
            <div className="flex h-44 w-full items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-400">
              <FileText className="h-10 w-10" />
            </div>
          )}
          <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-cyan-700 hover:text-cyan-900">
            View document
          </a>
          <p className="mt-1 truncate text-xs text-slate-500">{document.file_name}</p>
        </>
      ) : (
        <div className="flex h-44 w-full items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-white text-sm text-slate-500">
          Not uploaded
        </div>
      )}
    </div>
  );
}
