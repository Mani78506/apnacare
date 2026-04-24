import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { locationAPI } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BriefcaseMedical, Heart, IdCard, ImageIcon, Lock, Mail, MapPin, Phone, ShieldCheck, User } from "lucide-react";

type UploadDocument = {
  file_name: string;
  content_type?: string;
  file_data: string;
};

const skillOptions = [
  { id: "elder-care", label: "Elder Care" },
  { id: "mobility-support", label: "Mobility Support" },
  { id: "vitals-check", label: "Vitals Check" },
  { id: "medication-support", label: "Medication Support" },
];

export default function SignupPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "user" as "user" | "caregiver",
    location: "",
    address: "",
    gender: "",
    latitude: "",
    longitude: "",
    experience: "",
    skills: [] as string[],
    profile_photo: null as UploadDocument | null,
    id_proof: null as UploadDocument | null,
    certificate: null as UploadDocument | null,
  });
  const { signup, loading } = useAuth();
  const isCaregiver = form.role === "caregiver";
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [lastResolvedAddress, setLastResolvedAddress] = useState("");

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: e.target.value }));

  const toggleSkill = (skill: string, checked: boolean) =>
    setForm((current) => ({
      ...current,
      skills: checked ? [...current.skills, skill] : current.skills.filter((item) => item !== skill),
    }));

  const handleDocumentChange = (field: "profile_photo" | "id_proof" | "certificate") => async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((current) => ({ ...current, [field]: null }));
      return;
    }

    const toBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Unable to read selected file"));
      reader.readAsDataURL(file);
    });

    setForm((current) => ({
      ...current,
      [field]: {
        file_name: file.name,
        content_type: file.type,
        file_data: toBase64,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isCaregiver && (!form.profile_photo || !form.id_proof || !form.certificate)) {
      toast.error("Profile photo, ID proof, and certificate are required for caregiver signup.");
      return;
    }
    signup({
      name: form.name,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: form.role,
      location: isCaregiver ? form.location : undefined,
      address: isCaregiver ? form.address || form.location : undefined,
      gender: isCaregiver && form.gender ? (form.gender as "male" | "female" | "other") : undefined,
      latitude: isCaregiver && form.latitude ? Number(form.latitude) : undefined,
      longitude: isCaregiver && form.longitude ? Number(form.longitude) : undefined,
      experience: isCaregiver ? Number(form.experience) : undefined,
      skills: isCaregiver ? form.skills : undefined,
      profile_photo: isCaregiver ? form.profile_photo ?? undefined : undefined,
      id_proof: isCaregiver ? form.id_proof ?? undefined : undefined,
      certificate: isCaregiver ? form.certificate ?? undefined : undefined,
    });
  };

  const captureCaregiverLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((current) => ({
          ...current,
          address: current.address || "Current location selected",
          location: current.location || current.address || "Current location selected",
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        toast.success("Current location captured");
      },
      () => toast.error("Unable to capture current location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const resolveCaregiverAddress = async () => {
    const address = form.address.trim();
    if (!address) {
      toast.error("Enter the caregiver address first.");
      return;
    }

    setResolvingAddress(true);
    try {
      const { data } = await locationAPI.geocodeAddress(address);
      setForm((current) => ({
        ...current,
        address: data.address,
        location: data.address,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
      }));
      setLastResolvedAddress(data.address.trim().toLowerCase());
      toast.success("Coordinates fetched from address");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to fetch coordinates for this address.");
    } finally {
      setResolvingAddress(false);
    }
  };

  useEffect(() => {
    if (!isCaregiver) {
      return;
    }

    const address = form.address.trim();
    if (!address || address.length < 8) {
      return;
    }

    const normalized = address.toLowerCase();
    if (normalized === lastResolvedAddress || resolvingAddress) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setResolvingAddress(true);
        const { data } = await locationAPI.geocodeAddress(address);
        setForm((current) => {
          if (current.address.trim().toLowerCase() !== normalized) {
            return current;
          }
          return {
            ...current,
            address: data.address,
            location: data.address,
            latitude: String(data.latitude),
            longitude: String(data.longitude),
          };
        });
        setLastResolvedAddress(data.address.trim().toLowerCase());
      } catch {
        // Leave manual address untouched when auto-geocoding misses.
      } finally {
        setResolvingAddress(false);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [form.address, isCaregiver, lastResolvedAddress, resolvingAddress]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(180deg,_#f6fbff_0%,_#f9fcff_100%)] px-4 py-4 lg:py-3">
      <div className="mx-auto grid max-w-[1320px] gap-5 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_28px_100px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:p-7">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:text-slate-950">
            Back to portal selection
          </Link>

          <div className="mt-7 max-w-[540px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
              <ShieldCheck className="h-4 w-4" />
              {isCaregiver ? "Caregiver onboarding" : "New patient account"}
            </div>
            <h1 className="mt-4 font-serif text-[3rem] leading-[0.88] tracking-[-0.06em] text-slate-950 md:text-[3.7rem]">
              {isCaregiver
                ? "Join ApnaCare as a caregiver with an onboarding flow built for real field operations."
                : "Start using ApnaCare with an account built for family-centered care."}
            </h1>
            <p className="mt-4 max-w-[520px] text-[15px] leading-7 text-slate-600 md:text-base">
              {isCaregiver
                ? "Create your caregiver profile, share your service skills, and get ready for assignment, live routing, and patient visits."
                : "Create your account to book caregivers, store care requests, and coordinate home visits with more confidence."}
            </p>
          </div>

          <div className="mt-7 rounded-[26px] border border-slate-200 bg-slate-950 p-4 text-white">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-300">What you get</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <p className="font-medium">{isCaregiver ? "Fast field onboarding" : "Booking in minutes"}</p>
                <p className="mt-2 text-sm leading-5 text-slate-300">
                  {isCaregiver
                    ? "Set up your professional profile once and move into dispatch-ready caregiver operations."
                    : "Create a request quickly and get assigned caregiver support fast."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <p className="font-medium">{isCaregiver ? "Live operations ready" : "Live visibility"}</p>
                <p className="mt-2 text-sm leading-5 text-slate-300">
                  {isCaregiver
                    ? "Your profile connects directly into live queue, route status, and patient visit workflows."
                    : "Track caregiver movement and arrival after the booking is confirmed."}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                isCaregiver ? "Dispatch-ready profile" : "Quick request flow",
                isCaregiver ? "Live job visibility" : "Live caregiver tracking",
                isCaregiver ? "Role-based caregiver access" : "Family-centered booking",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card className="w-full rounded-[32px] border-white/70 bg-white/90 shadow-[0_30px_110px_rgba(15,23,42,0.10)]">
          <CardHeader className="space-y-2.5 px-6 pb-3 pt-6 sm:px-7">
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg">
                <Heart className="h-4.5 w-4.5 fill-white" />
              </div>
            </div>
            <div className="text-center">
              <CardTitle className="text-[2rem]">{isCaregiver ? "Become a caregiver" : "Create account"}</CardTitle>
              <CardDescription className="mt-1.5">
                {isCaregiver ? "Complete your onboarding to enter the caregiver hub" : "Set up your ApnaCare patient account"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-6 sm:px-7 sm:pb-7">
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid gap-3.5 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>I am signing up as</Label>
                  <Select value={form.role} onValueChange={(value: "user" | "caregiver") => setForm((current) => ({ ...current, role: value }))}>
                    <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Patient / Family</SelectItem>
                      <SelectItem value="caregiver">Caregiver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="John Doe" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.name} onChange={update("name")} required />
                  </div>
                </div>
              </div>

              <div className="grid gap-3.5 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="you@example.com" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.email} onChange={update("email")} required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input type="tel" placeholder="+91 9876543210" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.phone} onChange={update("phone")} required />
                  </div>
                </div>
              </div>

              <div className={`grid gap-3.5 ${isCaregiver ? "lg:grid-cols-2" : ""}`}>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input type="password" placeholder="Create a password" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.password} onChange={update("password")} required />
                  </div>
                </div>

                {isCaregiver ? (
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Home base, city, or service address"
                        className="h-12 rounded-2xl border-slate-200 pl-10"
                        value={form.address}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            address: event.target.value,
                            location: event.target.value,
                          }))
                        }
                        required={isCaregiver}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {resolvingAddress
                        ? "Fetching coordinates from the typed caregiver address..."
                        : form.latitude && form.longitude
                          ? "Coordinates are ready from address or current location."
                          : "Type the address and wait, or use the location buttons below."}
                    </p>
                  </div>
                ) : null}
              </div>

              {isCaregiver ? (
                <div className="rounded-[24px] border border-emerald-200/70 bg-[linear-gradient(180deg,rgba(236,253,245,0.85),rgba(255,255,255,0.92))] p-3.5">
                  <div className="mb-3.5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
                      <BriefcaseMedical className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-700">Caregiver profile</p>
                      <p className="text-sm text-slate-600">Required to start dispatch and patient assignment.</p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[0.36fr_0.64fr]">
                    <div className="space-y-2">
                      <Label>Experience</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Years of experience"
                        className="h-12 rounded-2xl border-slate-200"
                        value={form.experience}
                        onChange={update("experience")}
                        required={isCaregiver}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Gender</Label>
                          <Select value={form.gender} onValueChange={(value) => setForm((current) => ({ ...current, gender: value }))}>
                            <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Current location</Label>
                          <div className="grid gap-2">
                            <Button type="button" variant="outline" className="h-12 w-full rounded-2xl border-slate-200 bg-white" onClick={() => void resolveCaregiverAddress()} disabled={resolvingAddress}>
                              {resolvingAddress ? "Fetching from address..." : "Use Address"}
                            </Button>
                            <Button type="button" variant="outline" className="h-12 w-full rounded-2xl border-slate-200 bg-white" onClick={captureCaregiverLocation}>
                              Use My Current Location
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Latitude</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Optional latitude"
                            className="h-12 rounded-2xl border-slate-200 bg-white"
                            value={form.latitude}
                            onChange={update("latitude")}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Longitude</Label>
                          <Input
                            type="number"
                            step="any"
                            placeholder="Optional longitude"
                            className="h-12 rounded-2xl border-slate-200 bg-white"
                            value={form.longitude}
                            onChange={update("longitude")}
                          />
                        </div>
                      </div>
                      <Label>Skills</Label>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {skillOptions.map((skill) => (
                          <label
                            key={skill.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-sm transition ${
                              form.skills.includes(skill.label)
                                ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            <Checkbox
                              checked={form.skills.includes(skill.label)}
                              onCheckedChange={(checked) => toggleSkill(skill.label, checked === true)}
                            />
                            <span>{skill.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <DocumentUploadCard
                      label="Profile photo"
                      hint="Clear face photo for caregiver verification."
                      icon={ImageIcon}
                      file={form.profile_photo}
                      accept=".png,.jpg,.jpeg,.webp"
                      onChange={handleDocumentChange("profile_photo")}
                    />
                    <DocumentUploadCard
                      label="ID proof"
                      hint="Upload Aadhaar, PAN, or government ID."
                      icon={IdCard}
                      file={form.id_proof}
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleDocumentChange("id_proof")}
                    />
                    <DocumentUploadCard
                      label="Certificate"
                      hint="Required professional or training certificate."
                      icon={BriefcaseMedical}
                      file={form.certificate}
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleDocumentChange("certificate")}
                    />
                  </div>
                </div>
              ) : null}

              <div className={`grid gap-3 ${isCaregiver ? "lg:grid-cols-[1fr_auto]" : ""}`}>
                <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={loading}>
                  {loading ? "Creating account..." : isCaregiver ? "Create caregiver profile" : "Create account"}
                </Button>
                {isCaregiver ? (
                  <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
                    Fast review. Ready for caregiver sign-in after setup.
                  </div>
                ) : null}
              </div>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to={isCaregiver ? "/caregiver/login" : "/login"} className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function DocumentUploadCard({
  label,
  hint,
  icon: Icon,
  file,
  accept,
  onChange,
}: {
  label: string;
  hint: string;
  icon: typeof ImageIcon;
  file: UploadDocument | null;
  accept: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-[22px] border border-emerald-200 bg-white/80 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{hint}</p>
        </div>
      </div>
      <Input type="file" accept={accept} className="mt-3 h-12 rounded-2xl border-slate-200 bg-white" onChange={onChange} />
      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-sm text-slate-700">
        {file ? `Selected: ${file.file_name}` : "Required before caregiver signup can continue."}
      </div>
    </div>
  );
}
