import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { bookingAPI, CareOptionsResponse, locationAPI, paymentAPI } from "@/lib/api";
import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock, HeartPulse, MapPin, ShieldCheck, User } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { formatLabel } from "@/lib/utils";

const HOURLY_RATE = 200;
const DAILY_RATE = 1200;
const MONTHLY_RATE = 20000;

const conditionOptions = [
  { value: "elderly_care", label: "Elderly Care", description: "Old age support" },
  { value: "patient_care", label: "Patient Care", description: "General patient" },
  { value: "bedridden", label: "Bedridden", description: "Cannot walk / bed rest" },
] as const;

const durationOptions = [
  { value: "hourly", label: "Hourly", helper: "Charged per hour" },
  { value: "daily", label: "Daily", helper: "Full day support (8-12 hrs)" },
  { value: "monthly", label: "Monthly", helper: "Best for long-term care" },
] as const;

const serviceLabels: Record<string, string> = {
  elder_care: "Elder Care",
  medical: "Medical Care",
};

const conditionLabels: Record<string, string> = {
  elderly_care: "Old age support",
  patient_care: "General patient",
  bedridden: "Bedridden",
};

const careTypeLabels: Record<string, string> = {
  elderly_care: "Elderly Care",
  patient_care: "Patient Care",
  bedridden_care: "Bedridden Care",
};

const fallbackCareOptions: CareOptionsResponse = {
  elderly_care: [
    { value: "medicine_reminder", label: "Medicine Reminder" },
    { value: "walking_support", label: "Walking Support" },
    { value: "meal_assistance", label: "Meal Assistance" },
    { value: "companionship", label: "Companionship" },
    { value: "bathroom_assistance", label: "Bathroom Assistance" },
    { value: "other", label: "Other" },
  ],
  patient_care: [
    { value: "vitals_check", label: "Vitals Check" },
    { value: "injection_support", label: "Injection Support" },
    { value: "wound_care", label: "Wound Care" },
    { value: "medicine_assistance", label: "Medicine Assistance" },
    { value: "doctor_followup", label: "Doctor Follow-up" },
    { value: "other", label: "Other" },
  ],
  bedridden_care: [
    { value: "position_change", label: "Position Change" },
    { value: "bedsore_prevention", label: "Bedsore Prevention" },
    { value: "feeding_support", label: "Feeding Support" },
    { value: "hygiene_support", label: "Hygiene Support" },
    { value: "mobility_assistance", label: "Mobility Assistance" },
    { value: "other", label: "Other" },
  ],
};

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const calculateDisplayEndDate = (startDateValue: string, durationType: string, quantity: number) => {
  if (!startDateValue || quantity <= 0) return "";

  const startDate = parseDateInputValue(startDateValue);
  if (!startDate) return "";

  const endDate = new Date(startDate);
  if (durationType === "daily") {
    endDate.setDate(endDate.getDate() + quantity);
    return formatDateInputValue(endDate);
  }

  if (durationType === "monthly") {
    endDate.setMonth(endDate.getMonth() + quantity);
    return formatDateInputValue(endDate);
  }

  return startDateValue;
};

export default function BookingPage() {
  const navigate = useNavigate();
  const { setBookingId, user } = useStore();
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [bookingInlineMessage, setBookingInlineMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [createdBookingId, setCreatedBookingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    patient_name: "",
    age: "",
    date: "",
    time: "",
    service_type: "elder_care",
    patient_condition: "",
    care_type: "elderly_care",
    selected_care_tasks: [] as string[],
    custom_care_details: "",
    preferred_gender: "any",
    user_address: "",
    search_radius_km: "10",
    duration_type: "",
    hours: "",
    days: "",
    months: "",
    payment_method: "online",
    notes: "",
  });
  const [amount, setAmount] = useState(0);
  const [careOptions, setCareOptions] = useState<CareOptionsResponse>(fallbackCareOptions);
  const [prescription, setPrescription] = useState<{
    file_name: string;
    content_type?: string;
    file_data: string;
  } | null>(null);
  const [prescriptionLabel, setPrescriptionLabel] = useState("");
  const [locationState, setLocationState] = useState<{
    status: "idle" | "captured" | "error";
    latitude: number | null;
    longitude: number | null;
  }>({ status: "idle", latitude: null, longitude: null });
  const [lastResolvedAddress, setLastResolvedAddress] = useState("");
  const todayDateValue = useMemo(() => formatDateInputValue(new Date()), []);
  const currentCareOptions = careOptions[form.care_type] ?? [];
  const selectedCareLabels = currentCareOptions
    .filter((option) => form.selected_care_tasks.includes(option.value) && option.value !== "other")
    .map((option) => option.label);
  const careSelectionWarning = !form.selected_care_tasks.length && !form.notes.trim();

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const updateNotes = (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, notes: e.target.value }));

  const toggleCareTask = (task: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      selected_care_tasks: checked
        ? [...current.selected_care_tasks, task]
        : current.selected_care_tasks.filter((item) => item !== task),
      custom_care_details: !checked && task === "other" ? "" : current.custom_care_details,
    }));
  };

  useEffect(() => {
    const loadCareOptions = async () => {
      try {
        const response = await bookingAPI.getCareOptions();
        setCareOptions(response.data);
      } catch {
        setCareOptions(fallbackCareOptions);
      }
    };

    void loadCareOptions();
  }, []);

  useEffect(() => {
    const sanitize = (value: string) => {
      const parsed = Number(value);
      if (!value || Number.isNaN(parsed) || parsed <= 0) return 0;
      return parsed;
    };

    if (form.duration_type === "hourly") {
      setAmount(sanitize(form.hours) * HOURLY_RATE);
      return;
    }

    if (form.duration_type === "daily") {
      setAmount(sanitize(form.days) * DAILY_RATE);
      return;
    }

    if (form.duration_type === "monthly") {
      setAmount(sanitize(form.months) * MONTHLY_RATE);
      return;
    }

    setAmount(0);
  }, [form.days, form.duration_type, form.hours, form.months]);

  const durationValue = useMemo(() => {
    if (form.duration_type === "hourly") return Number(form.hours) || 0;
    if (form.duration_type === "daily") return Number(form.days) || 0;
    if (form.duration_type === "monthly") return Number(form.months) || 0;
    return 0;
  }, [form.days, form.duration_type, form.hours, form.months]);

  const durationSummary = useMemo(() => {
    if (!form.duration_type || durationValue <= 0) return "Not selected";
    if (form.duration_type === "hourly") return `${durationValue} hour${durationValue > 1 ? "s" : ""}`;
    if (form.duration_type === "daily") return `${durationValue} day${durationValue > 1 ? "s" : ""}`;
    return `${durationValue} month${durationValue > 1 ? "s" : ""}`;
  }, [durationValue, form.duration_type]);

  const durationHelper =
    durationOptions.find((option) => option.value === form.duration_type)?.helper ?? "Choose a duration model to calculate the estimate.";

  const calculatedEndDate = useMemo(
    () => calculateDisplayEndDate(form.date, form.duration_type, durationValue),
    [durationValue, form.date, form.duration_type],
  );
  const selectedDateIsPast = Boolean(form.date) && form.date < todayDateValue;
  const canSubmit = Boolean(form.duration_type) && amount > 0 && Boolean(form.date) && !selectedDateIsPast;

  const handleDurationChange = (value: string) => {
    setForm((f) => ({
      ...f,
      duration_type: value,
      hours: value === "hourly" ? f.hours : "",
      days: value === "daily" ? f.days : "",
      months: value === "monthly" ? f.months : "",
    }));
  };

  const updatePositiveNumber = (field: "hours" | "days" | "months" | "age") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    if (nextValue === "") {
      setForm((f) => ({ ...f, [field]: "" }));
      return;
    }

    const parsed = Number(nextValue);
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    setForm((f) => ({ ...f, [field]: String(parsed) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) {
      toast.error("Select a valid booking date.");
      return;
    }
    if (selectedDateIsPast) {
      toast.error("Booking date cannot be in the past.");
      return;
    }
    if (!canSubmit) {
      toast.error("Select a valid duration and quantity to continue.");
      return;
    }
    setLoading(true);
    setBookingInlineMessage(null);
    try {
      const res = await bookingAPI.create({
        patient_name: form.patient_name,
        age: parseInt(form.age),
        date: form.date,
        time: form.time,
        service_type: form.service_type,
        patient_condition: form.patient_condition,
        care_type: form.care_type,
        selected_care_tasks: form.selected_care_tasks,
        custom_care_details: form.custom_care_details,
        preferred_gender: form.preferred_gender as "any" | "male" | "female",
        user_address: form.user_address || undefined,
        user_latitude: locationState.latitude ?? undefined,
        user_longitude: locationState.longitude ?? undefined,
        search_radius_km: Number(form.search_radius_km || 10),
        duration_type: form.duration_type,
        hours: form.duration_type === "hourly" ? Number(form.hours) : undefined,
        days: form.duration_type === "daily" ? Number(form.days) : undefined,
        months: form.duration_type === "monthly" ? Number(form.months) : undefined,
        payment_method: form.payment_method as "online" | "cash_on_delivery",
        notes: form.notes,
        prescription: prescription ?? undefined,
      } as any);
      const bookingId = Number(res.data.booking_id);
      setCreatedBookingId(bookingId);
      setBookingId(String(bookingId));
      const caregiverAssigned = Boolean(res.data?.caregiver?.id) || res.data?.status === "assigned";

      toast.success("Booking created successfully");
      if (res.data?.message === "Location required for smart caregiver assignment.") {
        toast.info("Booking saved. Add location next time to enable smart caregiver assignment.");
      }
      if (form.payment_method === "cash_on_delivery") {
        toast.info("Cash on delivery selected");
        if (res.data?.caregiver?.name) {
          toast.info(`Caregiver assigned: ${res.data.caregiver.name}`);
        } else if (res.data?.message === "No available caregiver found in your selected range") {
          toast.info("No caregiver available within selected range. Try increasing range.");
        } else {
          toast.info("Payment choice saved. Caregiver assignment is pending availability.");
        }
        navigate(caregiverAssigned ? `/tracking/${bookingId}` : "/home");
      } else {
        toast.info("Complete payment to assign the best available caregiver.");
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || "Booking failed";
      if (
        message === "No available caregiver found in your selected range" ||
        message === "Location required for smart caregiver assignment."
      ) {
        setBookingInlineMessage({
          tone: "error",
          text:
            message === "No available caregiver found in your selected range"
              ? "Booking was not created because no caregiver is available within your selected range. Try increasing the search radius or changing the address."
              : "Booking was not created because a valid location is required for smart caregiver assignment.",
        });
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrescriptionChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPrescription(null);
      setPrescriptionLabel("");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Prescription must be smaller than 10MB.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        toast.error("Unable to read the prescription file.");
        return;
      }

      setPrescription({
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        file_data: result,
      });
      setPrescriptionLabel(file.name);
    };
    reader.onerror = () => toast.error("Unable to read the prescription file.");
    reader.readAsDataURL(file);
  };

  const captureUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationState({ status: "error", latitude: null, longitude: null });
      toast.error("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationState({
          status: "captured",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setForm((current) => ({
          ...current,
          user_address: current.user_address || "Current location selected",
        }));
        toast.success("Location captured successfully");
      },
      () => {
        setLocationState({ status: "error", latitude: null, longitude: null });
        toast.error("Location permission denied. Please enable GPS/location access.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const resolveAddressLocation = async () => {
    const address = form.user_address.trim();
    if (!address) {
      toast.error("Enter the patient address first.");
      return;
    }

    setResolvingAddress(true);
    try {
      const { data } = await locationAPI.geocodeAddress(address);
      setForm((current) => ({ ...current, user_address: data.address }));
      setLocationState({
        status: "captured",
        latitude: data.latitude,
        longitude: data.longitude,
      });
      setLastResolvedAddress(data.address.trim().toLowerCase());
      toast.success("Coordinates fetched from address");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to fetch coordinates for this address.");
    } finally {
      setResolvingAddress(false);
    }
  };

  useEffect(() => {
    const address = form.user_address.trim();
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
          if (current.user_address.trim().toLowerCase() !== normalized) {
            return current;
          }
          return { ...current, user_address: data.address };
        });
        setLocationState({
          status: "captured",
          latitude: data.latitude,
          longitude: data.longitude,
        });
        setLastResolvedAddress(data.address.trim().toLowerCase());
      } catch {
        // Keep manual address entry untouched if auto-geocoding misses.
      } finally {
        setResolvingAddress(false);
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [form.user_address, lastResolvedAddress, resolvingAddress]);

  const handlePayment = async () => {
    if (!createdBookingId) return;
    if (!window.Razorpay) {
      toast.error("Razorpay checkout is unavailable. Refresh the page and try again.");
      return;
    }

    setPaying(true);
    try {
      const { data } = await paymentAPI.createOrder(createdBookingId);
      const razorpay = new window.Razorpay({
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: "ApnaCare",
        description: `Booking #${createdBookingId} payment`,
        prefill: {
          name: user?.name,
          email: user?.email,
        },
        notes: {
          booking_id: String(createdBookingId),
        },
        theme: {
          color: "#0891b2",
        },
        handler: async (response) => {
          try {
            const verification = await paymentAPI.verify(response);
            const caregiverAssigned = Boolean(verification.data?.caregiver?.id) || verification.data?.booking_status === "assigned";
            toast.success("Payment successful");
            if (verification.data.caregiver?.name) {
              toast.info(`Caregiver assigned: ${verification.data.caregiver.name}`);
            } else if (verification.data.assignment_reason?.includes("No available caregiver")) {
              toast.info("No caregiver available within selected range. Try increasing range.");
            } else {
              toast.info("Payment verified. Caregiver assignment is pending availability.");
            }
            navigate(caregiverAssigned ? `/tracking/${createdBookingId}` : "/home");
          } catch (err: any) {
            toast.error(err.response?.data?.detail || "Payment verification failed");
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            toast.info("Payment was cancelled.");
          },
        },
      });

      razorpay.on("payment.failed", (response) => {
        setPaying(false);
        toast.error(response.error?.description || "Payment failed");
      });

      razorpay.open();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Payment failed");
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)]">
      <Navbar />
      <main className="container mx-auto px-4 py-8 lg:py-10">
        <section className="grid items-start gap-8 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="space-y-5">
            <div className="rounded-[32px] border border-slate-200/80 bg-white/85 p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)]">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
                <ShieldCheck className="h-4 w-4" />
                Booking flow
              </div>
              <h1 className="mt-5 font-serif text-5xl leading-[0.96] tracking-[-0.05em] text-slate-950">
                Book home care with patient details that are clear from the start.
              </h1>
              <p className="mt-5 text-lg leading-8 text-slate-600">
                Share the patient name, age, and preferred visit timing so ApnaCare can match the request with the right caregiver quickly.
              </p>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-300">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">Online bookings assign a caregiver only after payment verification is complete.</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">Cash on delivery bookings assign the caregiver immediately after you confirm the booking.</div>
              </div>
            </div>
          </div>

          <Card className="animate-slide-up self-start rounded-[32px] border-white/70 bg-white/92 shadow-[0_28px_100px_rgba(15,23,42,0.10)]">
            <CardHeader className="px-6 pb-4 pt-7 text-center sm:px-8">
              <CardTitle className="text-3xl">Book a caregiver</CardTitle>
              <CardDescription className="mt-2">Fill in the patient details to get started</CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-2">
                  <Label>Patient Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Patient's full name" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.patient_name} onChange={update("patient_name")} required />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Age</Label>
                    <Input type="number" placeholder="Age" min={1} max={120} className="h-12 rounded-2xl border-slate-200" value={form.age} onChange={updatePositiveNumber("age")} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Service Type</Label>
                    <Select value={form.service_type} onValueChange={(value) => setForm((f) => ({ ...f, service_type: value }))}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elder_care">{serviceLabels.elder_care}</SelectItem>
                        <SelectItem value="medical">{serviceLabels.medical}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Patient Condition</Label>
                    <Select value={form.patient_condition} onValueChange={(value) => setForm((f) => ({ ...f, patient_condition: value }))}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                        <SelectValue placeholder="Select patient condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">
                      {conditionOptions.find((option) => option.value === form.patient_condition)?.description ?? "Helps match the right caregiver profile."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Preferred Caregiver Gender</Label>
                    <Select value={form.preferred_gender} onValueChange={(value) => setForm((f) => ({ ...f, preferred_gender: value }))}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                        <SelectValue placeholder="Choose a preference" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">Used as a matching preference when caregivers are available.</p>
                  </div>
                </div>
                <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-slate-950">Patient location</Label>
                      <p className="mt-1 text-xs text-slate-500">Location helps ApnaCare prefer the nearest approved caregiver.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white" onClick={() => void resolveAddressLocation()} disabled={resolvingAddress}>
                        <MapPin className="h-4 w-4" />
                        {resolvingAddress ? "Fetching..." : "Use Address"}
                      </Button>
                      <Button type="button" variant="outline" className="h-10 rounded-2xl border-slate-200 bg-white" onClick={captureUserLocation}>
                        <MapPin className="h-4 w-4" />
                        Use My Current Location
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Textarea
                      placeholder="Enter the patient address or landmark"
                      className="min-h-[86px] rounded-2xl border-slate-200 bg-white"
                      value={form.user_address}
                      onChange={(event) => setForm((current) => ({ ...current, user_address: event.target.value }))}
                    />
                    <p className="text-xs text-slate-500">
                      {resolvingAddress
                        ? "Fetching coordinates from the typed address..."
                        : locationState.status === "captured" && locationState.latitude !== null && locationState.longitude !== null
                          ? "Location captured successfully"
                          : "Type an address and wait, or use the buttons to fetch coordinates."}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Search radius</Label>
                      <Select value={form.search_radius_km} onValueChange={(value) => setForm((current) => ({ ...current, search_radius_km: value }))}>
                        <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                          <SelectValue placeholder="Choose search radius" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 km</SelectItem>
                          <SelectItem value="10">10 km</SelectItem>
                          <SelectItem value="20">20 km</SelectItem>
                          <SelectItem value="50">50 km</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Coordinates</Label>
                      <div className="flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700">
                        {locationState.status === "captured" && locationState.latitude !== null && locationState.longitude !== null
                          ? `${locationState.latitude.toFixed(5)}, ${locationState.longitude.toFixed(5)}`
                          : "Waiting for current location"}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">
                    {locationState.status === "captured" && locationState.latitude !== null && locationState.longitude !== null
                      ? `Location captured successfully (${locationState.latitude.toFixed(4)}, ${locationState.longitude.toFixed(4)})`
                      : "Location not provided"}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Service Duration</Label>
                    <Select value={form.duration_type} onValueChange={handleDurationChange}>
                      <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                        <SelectValue placeholder="Select duration type" />
                      </SelectTrigger>
                      <SelectContent>
                        {durationOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500">{durationHelper}</p>
                  </div>
                </div>
                {form.duration_type ? (
                  <div className="space-y-2">
                    <Label>
                      {form.duration_type === "hourly" && "Enter number of hours"}
                      {form.duration_type === "daily" && "Enter number of days"}
                      {form.duration_type === "monthly" && "Enter number of months"}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder={
                        form.duration_type === "hourly"
                          ? "Hours required"
                          : form.duration_type === "daily"
                            ? "Days required"
                            : "Months required"
                      }
                      className="h-12 rounded-2xl border-slate-200"
                      value={
                        form.duration_type === "hourly"
                          ? form.hours
                          : form.duration_type === "daily"
                            ? form.days
                            : form.months
                      }
                      onChange={
                        form.duration_type === "hourly"
                          ? updatePositiveNumber("hours")
                          : form.duration_type === "daily"
                            ? updatePositiveNumber("days")
                            : updatePositiveNumber("months")
                      }
                      required
                    />
                  </div>
                ) : null}
                <div className={`grid gap-3 ${form.duration_type === "daily" || form.duration_type === "monthly" ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
                  <div className="space-y-2">
                    <Label>{form.duration_type === "daily" || form.duration_type === "monthly" ? "Start Date" : "Date"}</Label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        min={todayDateValue}
                        className="h-12 rounded-2xl border-slate-200 pl-10"
                        value={form.date}
                        onChange={update("date")}
                        required
                      />
                    </div>
                  </div>
                  {form.duration_type === "daily" || form.duration_type === "monthly" ? (
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <div className="relative">
                        <CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="h-12 rounded-2xl border-slate-200 bg-slate-50 pl-10 text-slate-600"
                          value={calculatedEndDate}
                          readOnly
                          tabIndex={-1}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input type="time" className="h-12 rounded-2xl border-slate-200 pl-10" value={form.time} onChange={update("time")} required />
                    </div>
                  </div>
                </div>
                {selectedDateIsPast ? <p className="text-sm text-rose-600">Booking date cannot be in the past.</p> : null}
                {(form.duration_type === "daily" || form.duration_type === "monthly") && calculatedEndDate ? (
                  <p className="text-sm text-slate-600">Service range: {form.date} to {calculatedEndDate}</p>
                ) : null}
                <div className="space-y-4 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Care Type</Label>
                      <Select
                        value={form.care_type}
                        onValueChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            care_type: value,
                            selected_care_tasks: [],
                            custom_care_details: "",
                          }))
                        }
                      >
                        <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white">
                          <SelectValue placeholder="Select care type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="elderly_care">Elderly Care</SelectItem>
                          <SelectItem value="patient_care">Patient Care</SelectItem>
                          <SelectItem value="bedridden_care">Bedridden Care</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="font-semibold text-slate-950">Care requirements</p>
                      <p className="mt-1">Select the specific work the caregiver should see as the visit checklist.</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentCareOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800"
                      >
                        <Checkbox
                          checked={form.selected_care_tasks.includes(option.value)}
                          onCheckedChange={(checked) => toggleCareTask(option.value, Boolean(checked))}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>

                  {form.selected_care_tasks.includes("other") ? (
                    <div className="space-y-2">
                      <Label>Please describe the required care</Label>
                      <Textarea
                        className="min-h-[90px] rounded-2xl border-slate-200 bg-white"
                        placeholder="Example: Needs help climbing stairs"
                        value={form.custom_care_details}
                        onChange={(event) => setForm((current) => ({ ...current, custom_care_details: event.target.value }))}
                      />
                    </div>
                  ) : null}

                  {careSelectionWarning ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Please select at least one care requirement or choose Other.
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Additional Patient Notes</Label>
                  <Textarea
                    placeholder="Add extra instructions, medicine timing, or family preferences."
                    className="min-h-[96px] rounded-2xl border-slate-200"
                    value={form.notes}
                    onChange={updateNotes}
                  />
                  <p className="text-xs text-slate-500">
                    Kept for existing bookings and shown to the caregiver along with selected care requirements.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prescription">Patient Prescription</Label>
                  <Input
                    id="prescription"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="h-12 rounded-2xl border-slate-200 file:mr-4 file:rounded-xl file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-cyan-700"
                    onChange={(event) => void handlePrescriptionChange(event)}
                  />
                  <p className="text-xs text-slate-500">
                    Upload the latest doctor prescription so the caregiver can check medicines and care steps on time.
                  </p>
                  {prescriptionLabel ? <p className="text-sm font-medium text-slate-700">Selected: {prescriptionLabel}</p> : null}
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method} onValueChange={(value) => setForm((f) => ({ ...f, payment_method: value }))}>
                    <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Pay Online</SelectItem>
                      <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {form.payment_method === "cash_on_delivery"
                      ? "Your caregiver will be assigned after the COD booking is confirmed."
                      : "Your caregiver will be assigned after secure online payment verification."}
                  </p>
                </div>
                <div className="rounded-[24px] border border-cyan-100 bg-cyan-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">Estimated Cost</p>
                      <p className="text-3xl font-bold tracking-[-0.03em] text-slate-950">₹{amount.toLocaleString("en-IN")}</p>
                      <p className="text-sm text-slate-600">{durationHelper}</p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-sm sm:max-w-[260px]">
                      <p className="font-semibold text-slate-950">Booking summary</p>
                      <p className="mt-2">Service: {serviceLabels[form.service_type] ?? formatLabel(form.service_type)}</p>
                      <p>Condition: {(conditionLabels[form.patient_condition] ?? formatLabel(form.patient_condition)) || "Not selected"}</p>
                      <p>Care type: {careTypeLabels[form.care_type] ?? formatLabel(form.care_type)}</p>
                      <p>Care tasks: {selectedCareLabels.length ? selectedCareLabels.join(", ") : "Not selected"}</p>
                      {form.selected_care_tasks.includes("other") ? (
                        <p>Custom care: {form.custom_care_details.trim() || "Not described"}</p>
                      ) : null}
                      <p>Additional notes: {form.notes.trim() || "None"}</p>
                      <p>Duration: {durationSummary}</p>
                      <p>
                        Schedule: {form.date ? (calculatedEndDate && (form.duration_type === "daily" || form.duration_type === "monthly") ? `${form.date} to ${calculatedEndDate}` : form.date) : "Not selected"}
                      </p>
                      <p className="font-semibold text-slate-950">Cost: ₹{amount.toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 pt-1 sm:grid-cols-2">
                  <Button type="submit" className="h-12 w-full rounded-2xl text-base" disabled={loading || !canSubmit}>
                    {loading ? "Booking..." : form.payment_method === "cash_on_delivery" ? "Confirm COD booking" : "Continue to payment"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-12 w-full rounded-2xl text-base"
                    disabled={!createdBookingId || paying || form.payment_method !== "online"}
                    onClick={() => void handlePayment()}
                  >
                    {paying ? "Processing payment..." : "Pay Now"}
                  </Button>
                </div>
                {bookingInlineMessage ? (
                  <div
                    className={`rounded-[20px] border px-4 py-4 text-sm leading-6 ${
                      bookingInlineMessage.tone === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-cyan-200 bg-cyan-50 text-cyan-800"
                    }`}
                  >
                    {bookingInlineMessage.text}
                  </div>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
