import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { useSocket } from "@/hooks/useSocket";
import { BookingTask, CaregiverDocumentSummary, PublicCaregiverProfile, bookingAPI, getCaregiverDocumentUrl, getQrCodeUrl, paymentAPI, trackingAPI } from "@/lib/api";
import TrackingMapPanel from "@/components/TrackingMapPanel";
import StatusBadge from "@/components/StatusBadge";
import Navbar from "@/components/Navbar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Clock3, IndianRupee, Phone, QrCode, Route, ShieldCheck, UserRound } from "lucide-react";

const STATUS_STEPS = ["assigned", "accepted", "on_the_way", "arrived", "started", "completed"] as const;
const STATUS_COPY: Record<string, string> = {
  pending: "We are preparing the live route stream and caregiver assignment.",
  assigned: "A caregiver has been assigned.",
  accepted: "The caregiver accepted the booking.",
  on_the_way: "The caregiver is on the way.",
  arrived: "The caregiver has reached your location.",
  started: "Care service has started.",
  completed: "This visit has been completed successfully.",
  rejected: "This booking was rejected and is no longer active.",
};

const careTypeLabels: Record<string, string> = {
  elderly_care: "Elderly Care",
  patient_care: "Patient Care",
  bedridden_care: "Bedridden Care",
};

const careTaskLabels: Record<string, string> = {
  medicine_reminder: "Medicine Reminder",
  walking_support: "Walking Support",
  meal_assistance: "Meal Assistance",
  companionship: "Companionship",
  bathroom_assistance: "Bathroom Assistance",
  vitals_check: "Vitals Check",
  injection_support: "Injection Support",
  wound_care: "Wound Care",
  medicine_assistance: "Medicine Assistance",
  doctor_followup: "Doctor Follow-up",
  position_change: "Position Change",
  bedsore_prevention: "Bedsore Prevention",
  feeding_support: "Feeding Support",
  hygiene_support: "Hygiene Support",
  mobility_assistance: "Mobility Assistance",
  other: "Other",
};

const formatCoordinate = (value: number) => value.toFixed(4);
const isImageDocument = (fileName?: string | null) => Boolean(fileName && /\.(png|jpe?g|webp|gif|bmp)$/i.test(fileName));

function getDistanceKm(start: { lat: number; lng: number }, end: { lat: number; lng: number }) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(end.lat - start.lat);
  const dLng = toRadians(end.lng - start.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(start.lat)) * Math.cos(toRadians(end.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatApiTime(value: string | null | undefined) {
  if (!value) return null;
  const normalizedValue = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const parsedDate = new Date(normalizedValue);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TrackingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { caregiverLocation, bookingStatus, eta, setETA, setBookingId, setBookingStatus, setCaregiverLocation } = useStore();
  const [status, setStatus] = useState("assigned");
  const [assignedCaregiver, setAssignedCaregiver] = useState<PublicCaregiverProfile | null>(null);
  const [bookingAmount, setBookingAmount] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BookingTask[]>([]);
  const [assignedDistanceKm, setAssignedDistanceKm] = useState<number | null>(null);
  const [assignmentReason, setAssignmentReason] = useState<string | null>(null);
  const [preferredGender, setPreferredGender] = useState<string | null>(null);
  const [careType, setCareType] = useState<string | null>(null);
  const [selectedCareTasks, setSelectedCareTasks] = useState<string[]>([]);
  const [customCareDetails, setCustomCareDetails] = useState<string | null>(null);
  const [patientNotes, setPatientNotes] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [paymentCollectedMethod, setPaymentCollectedMethod] = useState<string | null>(null);
  const [bookingOtp, setBookingOtp] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceStatus, setFaceStatus] = useState<string>("pending");
  const [manualOverride, setManualOverride] = useState(false);
  const [qrCodePath, setQrCodePath] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<CaregiverDocumentSummary | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastLocationUpdate, setLastLocationUpdate] = useState<Date | null>(null);
  const [paymentBusy, setPaymentBusy] = useState<"online" | "cash" | null>(null);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: "5", comment: "" });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [completionPromptShown, setCompletionPromptShown] = useState(false);
  const reviewSectionRef = useRef<HTMLElement | null>(null);
  const announcedTaskIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (bookingId) setBookingId(bookingId);
  }, [bookingId, setBookingId]);

  useSocket(bookingId ?? null);

  useEffect(() => {
    if (!bookingId) return;
    const fetchTrackingDetails = async () => {
      try {
        const res = await trackingAPI.getDetails(bookingId);
        setBookingStatus(res.data.booking.status);
        setStatus(res.data.booking.status || "assigned");
        if (
          res.data.booking.user_latitude != null &&
          res.data.booking.user_longitude != null
        ) {
          setUserLocation({
            lat: res.data.booking.user_latitude,
            lng: res.data.booking.user_longitude,
          });
        } else {
          setUserLocation(null);
        }
        if (res.data.latest_location?.lat != null && res.data.latest_location?.lng != null) {
          setCaregiverLocation({ lat: res.data.latest_location.lat, lng: res.data.latest_location.lng });
        } else if (!res.data.booking.caregiver || res.data.booking.status === "pending" || res.data.booking.status === "cancelled") {
          setCaregiverLocation(null);
        }
        setAssignedCaregiver(res.data.booking.caregiver ?? null);
        setBookingAmount(res.data.booking.amount ?? null);
        const nextTasks = res.data.booking.tasks ?? [];
        setTasks(nextTasks);
        nextTasks.forEach((task) => {
          const isDone = Boolean(task.completed || task.status === "completed");
          if (!isDone || announcedTaskIdsRef.current.has(task.id)) {
            return;
          }

          announcedTaskIdsRef.current.add(task.id);
          const completedLabel = formatApiTime(task.completed_at) ?? "just now";
          toast.success(`${task.name} completed at ${completedLabel}`);
        });
        setAssignedDistanceKm(res.data.booking.assigned_distance_km ?? null);
        setAssignmentReason(res.data.booking.assignment_reason ?? null);
        setPreferredGender(res.data.booking.preferred_gender ?? null);
        setCareType(res.data.booking.care_type ?? null);
        setSelectedCareTasks(res.data.booking.selected_care_tasks ?? []);
        setCustomCareDetails(res.data.booking.custom_care_details ?? null);
        setPatientNotes(res.data.booking.notes ?? null);
        setPaymentMethod(res.data.booking.payment_method ?? null);
        setPaymentStatus(res.data.booking.payment_status ?? null);
        setPaymentCollectedMethod(res.data.booking.payment_collected_method ?? null);
        setBookingOtp(res.data.booking.otp ?? null);
        setOtpVerified(Boolean(res.data.booking.otp_verified));
        setFaceVerified(Boolean(res.data.booking.face_verified));
        setFaceStatus(res.data.booking.face_verification_status ?? "pending");
        setManualOverride(Boolean(res.data.booking.manual_override));
        setQrCodePath(res.data.booking.qr_code_path ?? null);
        setReviewSubmitted(Boolean(res.data.booking.has_review));
        setReviewForm({
          rating: res.data.booking.review?.rating ? String(res.data.booking.review.rating) : "5",
          comment: res.data.booking.review?.comment || "",
        });
      } catch {}
    };
    const fetchETA = async () => {
      try {
        const res = await trackingAPI.getETA(bookingId);
        setETA(res.data.eta);
      } catch {}
    };
    void fetchTrackingDetails();
    void fetchETA();
    const interval = setInterval(() => {
      void fetchTrackingDetails();
      void fetchETA();
    }, 5000);
    return () => clearInterval(interval);
  }, [bookingId, setBookingStatus, setCaregiverLocation, setETA]);

  useEffect(() => {
    if (caregiverLocation) setLastLocationUpdate(new Date());
  }, [caregiverLocation]);

  useEffect(() => {
    if (bookingStatus) setStatus(bookingStatus);
  }, [bookingStatus]);

  useEffect(() => {
    if (status !== "completed") {
      setCompletionPromptShown(false);
      return;
    }

    if (!completionPromptShown) {
      toast.success(reviewSubmitted ? "Visit completed. You can update your caregiver review below." : "Visit completed. Please rate your caregiver below.");
      setCompletionPromptShown(true);
    }

    const timer = window.setTimeout(() => {
      reviewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [status, completionPromptShown, reviewSubmitted, reviewSectionRef]);

  const routeStageIndex = STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]);
  const hasActiveAssignment = status !== "pending" && status !== "cancelled";
  const hasLiveTracking = hasActiveAssignment && Boolean(assignedCaregiver) && Boolean(caregiverLocation);
  const distanceKm = useMemo(() => (userLocation && caregiverLocation ? getDistanceKm(userLocation, caregiverLocation) : null), [caregiverLocation, userLocation]);
  const lastUpdateLabel = lastLocationUpdate ? lastLocationUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Awaiting first ping";
  const allDocuments = assignedCaregiver?.documents ?? [];
  const profilePhoto = allDocuments.find((document) => document.document_type === "profile") ?? null;
  const qrCodeUrl = getQrCodeUrl(qrCodePath);
  const selectedDocumentUrl = selectedDocument ? getCaregiverDocumentUrl(selectedDocument.id) : null;
  const paymentMethodLabel = (paymentMethod ?? "online").replaceAll("_", " ");
  const paymentStatusLabel = (paymentStatus ?? "pending").replaceAll("_", " ");
  const collectedLabel = (paymentCollectedMethod ?? paymentMethod ?? "online").replaceAll("_", " ");
  const amountLabel = bookingAmount !== null ? `Rs. ${bookingAmount.toFixed(2)}` : "Pending";
  const requiresCompletionPayment = status === "completed" && paymentMethod === "cash_on_delivery" && paymentStatus !== "paid";

  const handleSubmitReview = async () => {
    if (!bookingId) return;
    const rating = Number(reviewForm.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      toast.error("Use a rating between 1 and 5.");
      return;
    }

    setReviewBusy(true);
    try {
      await bookingAPI.submitReview({ booking_id: Number(bookingId), rating, comment: reviewForm.comment.trim() });
      setReviewSubmitted(true);
      toast.success("Thank you for rating your caregiver. Your feedback helps ApnaCare keep every visit safe and reliable.");
      window.setTimeout(() => {
        navigate("/home", { replace: true });
      }, 1200);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to save review.");
    } finally {
      setReviewBusy(false);
    }
  };

  const handleCodOnlinePayment = async () => {
    if (!bookingId || !window.Razorpay) return toast.error("Razorpay checkout is unavailable. Refresh and try again.");
    setPaymentBusy("online");
    try {
      const { data } = await paymentAPI.createOrder(Number(bookingId));
      const razorpay = new window.Razorpay({
        key: data.key, amount: data.amount, currency: data.currency, order_id: data.order_id, name: "ApnaCare", description: `COD settlement for booking #${bookingId}`,
        theme: { color: "#0891b2" },
        handler: async (response) => {
          try {
            await paymentAPI.verify(response);
            setPaymentStatus("paid");
            setPaymentCollectedMethod("online");
            toast.success("Payment successful");
          } catch (err: any) {
            toast.error(err.response?.data?.detail || "Payment verification failed");
          } finally {
            setPaymentBusy(null);
          }
        },
        modal: { ondismiss: () => { setPaymentBusy(null); toast.info("Payment was cancelled."); } },
      });
      razorpay.on("payment.failed", (response) => { setPaymentBusy(null); toast.error(response.error?.description || "Payment failed"); });
      razorpay.open();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to start COD online payment");
      setPaymentBusy(null);
    }
  };

  const handleConfirmCashPaid = async () => {
    if (!bookingId) return;
    setPaymentBusy("cash");
    try {
      await paymentAPI.confirmCash(Number(bookingId));
      setPaymentStatus("paid");
      setPaymentCollectedMethod("cash");
      toast.success("Cash payment confirmed");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to confirm cash payment");
    } finally {
      setPaymentBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6fbff_0%,#ffffff_40%,#f8fafc_100%)]">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 xl:px-8">
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700"><ShieldCheck className="h-3.5 w-3.5" />Tracking</div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 md:text-4xl">Track your caregiver with less clutter.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{STATUS_COPY[status] ?? STATUS_COPY.pending}</p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-[470px]">
              <SummaryTile icon={Clock3} label="ETA" value={eta ?? "Waiting for route"} />
              <SummaryTile icon={Route} label="Distance" value={distanceKm ? `${distanceKm.toFixed(distanceKm > 10 ? 1 : 2)} km away` : "Distance pending"} />
              <SummaryTile icon={Activity} label="Signal" value={caregiverLocation ? "GPS signal locked" : "Waiting for GPS lock"} />
              <SummaryTile icon={IndianRupee} label="Amount" value={amountLabel} />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
          <div className="space-y-6">
            <section className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Live map</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{hasLiveTracking ? "Caregiver route is active" : "Waiting for complete location stream"}</h2></div><div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">Last sync {hasLiveTracking ? lastUpdateLabel : "Waiting for live route"}</div></div>
              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <MapStatusCard label="Current Status" value={(status || "assigned").replaceAll("_", " ")} tone="neutral" />
                <MapStatusCard label="Distance" value={distanceKm ? `${distanceKm.toFixed(distanceKm > 10 ? 1 : 2)} km` : "Waiting for both locations"} tone={distanceKm ? "good" : "neutral"} />
                <MapStatusCard label="Caregiver Location" value={caregiverLocation ? `${formatCoordinate(caregiverLocation.lat)}, ${formatCoordinate(caregiverLocation.lng)}` : "Waiting for caregiver live location..."} tone={caregiverLocation ? "good" : "warn"} />
                <MapStatusCard label="Patient Location" value={userLocation ? `${formatCoordinate(userLocation.lat)}, ${formatCoordinate(userLocation.lng)}` : "Patient location not available"} tone={userLocation ? "good" : "warn"} />
              </div>
              <TrackingMapPanel caregiverLocation={caregiverLocation} userLocation={userLocation} status={status} />
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><QrCode className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Doorstep verification</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">OTP and QR</h2></div></div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verification code</p><p className="mt-3 text-4xl font-semibold tracking-[0.22em] text-slate-950">{bookingOtp ?? "----"}</p><p className="mt-3 text-sm text-slate-600">{otpVerified ? "OTP verified. Face verification is the next trust step." : "Share this only when the caregiver arrives."}</p><div className="mt-4 grid gap-2"><KeyValue label="OTP verification" value={otpVerified ? "Verified" : "Pending"} /><KeyValue label="Face verification" value={manualOverride ? "Manual override approved" : faceVerified ? "Matched" : faceStatus.replaceAll("_", " ")} /></div>{assignedCaregiver?.phone ? <a href={`tel:${assignedCaregiver.phone}`} className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"><Phone className="h-4 w-4" />Call caregiver</a> : null}</div>
                <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">{qrCodeUrl ? <div className="flex flex-col items-center gap-4 text-center"><img src={qrCodeUrl} alt={`Booking ${bookingId} QR code`} className="h-48 w-48 rounded-[16px] border border-slate-200 bg-white object-contain p-2" /><p className="max-w-sm text-sm leading-6 text-slate-600">Scan the QR or use the OTP. Both are linked to the same booking verification.</p></div> : <div className="flex min-h-[240px] items-center justify-center rounded-[18px] border border-dashed border-slate-300 bg-white px-5 text-center text-sm leading-6 text-slate-500">QR will appear automatically once security details are generated.</div>}</div>
              </div>
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Progress</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Care journey</h2>
              {hasActiveAssignment ? (
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {STATUS_STEPS.map((step, index) => (
                    <div
                      key={step}
                      className={`rounded-[18px] border p-4 ${
                        status === step
                          ? "border-cyan-200 bg-cyan-50"
                          : routeStageIndex >= index
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-semibold ${
                            status === step
                              ? "bg-cyan-600 text-white"
                              : routeStageIndex >= index
                                ? "bg-emerald-600 text-white"
                                : "bg-white text-slate-600"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-semibold capitalize text-slate-950">{step.replaceAll("_", " ")}</p>
                          <p className="mt-1 text-sm leading-5 text-slate-600">{STATUS_COPY[step]}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-6 text-amber-900">
                  No caregiver has been assigned yet, so the live care journey has not started. Increase the search range or wait until a caregiver becomes available nearby.
                </div>
              )}
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Care requirements</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Patient care details</h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <DetailTile label="Care type" value={careType ? careTypeLabels[careType] ?? careType.replaceAll("_", " ") : "Not selected"} />
                <DetailTile
                  label="Care requirements"
                  value={
                    selectedCareTasks.length
                      ? selectedCareTasks.map((task) => careTaskLabels[task] ?? task.replaceAll("_", " ")).join(", ")
                      : "No structured care requirements selected"
                  }
                />
                <DetailTile label="Custom care details" value={customCareDetails?.trim() || "None"} />
                <DetailTile label="Additional patient notes" value={patientNotes?.trim() || "None"} />
              </div>
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Care checklist</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Patient notes in action</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">See each caregiver task as it gets completed during the visit.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {tasks.length ? tasks.map((task) => {
                  const isDone = Boolean(task.completed || task.status === "completed");
                  const completedLabel = formatApiTime(task.completed_at);
                  return (
                    <div
                      key={task.id}
                      className={`rounded-[18px] border px-4 py-4 ${
                        isDone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{task.name}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {isDone && completedLabel ? `Completed at ${completedLabel}` : "Waiting for caregiver completion"}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${
                            isDone
                              ? "border-emerald-200 bg-white text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600"
                          }`}
                        >
                          {isDone ? "Completed" : "Pending"}
                        </span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                    No care tasks have been created for this booking yet.
                  </div>
                )}
              </div>
            </section>

            {status === "completed" ? (
              <section ref={(node) => { reviewSectionRef.current = node; }} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Feedback</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Rate your caregiver</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Share a quick rating for this completed visit directly from the tracking page.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {reviewSubmitted ? "Your review is already saved. You can edit it below if you want to update your feedback." : "Your visit is complete. Please review the caregiver experience before you leave this page."}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-[0.35fr_1fr]">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-900">Rating</label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      step={1}
                      value={reviewForm.rating}
                      onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))}
                      className="h-11 rounded-[14px] border-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-900">Comment</label>
                    <Textarea
                      value={reviewForm.comment}
                      onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))}
                      className="min-h-[110px] rounded-[14px] border-slate-200"
                      placeholder="Tell us about the caregiver experience"
                    />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handleSubmitReview()} disabled={reviewBusy}>
                    {reviewBusy ? "Saving review..." : reviewSubmitted ? "Update review" : "Submit review"}
                  </Button>
                  {reviewSubmitted ? <span className="text-sm font-medium text-emerald-700">Review already saved. You can update it if needed.</span> : null}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Booking</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{bookingId ? `#${bookingId.slice(0, 8)}` : "Booking"}</h2></div><StatusBadge status={status} /></div><div className="mt-5 grid gap-3"><KeyValue label="Payment method" value={paymentMethodLabel} /><KeyValue label="Payment status" value={paymentStatusLabel} /><KeyValue label="Collected via" value={paymentStatus === "paid" ? collectedLabel : "Pending"} /></div></section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><IndianRupee className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Payment</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Settlement</h2><p className="mt-2 text-sm leading-6 text-slate-600">{paymentStatus === "paid" ? `Payment completed via ${collectedLabel}.` : paymentMethod === "cash_on_delivery" ? "COD bookings can be settled after care completion by cash or online payment." : "This booking uses verified online payment."}</p></div></div>
              <div className="mt-5 rounded-[20px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Current state</p><p className="mt-2 text-2xl font-semibold text-slate-950">{paymentStatusLabel}</p><p className="mt-2 text-sm text-slate-600">Amount: {amountLabel}</p></div>
              {requiresCompletionPayment ? <div className="mt-4 grid gap-3"><button type="button" onClick={() => void handleCodOnlinePayment()} disabled={paymentBusy !== null} className="rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">{paymentBusy === "online" ? "Opening checkout..." : "Pay online now"}</button><button type="button" onClick={() => void handleConfirmCashPaid()} disabled={paymentBusy !== null} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60">{paymentBusy === "cash" ? "Confirming cash..." : "Confirm cash paid"}</button></div> : null}
            </section>

            <section className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <div className="flex items-start gap-3">{profilePhoto ? <img src={getCaregiverDocumentUrl(profilePhoto.id)} alt={assignedCaregiver?.full_name || "Caregiver profile"} className="h-16 w-16 rounded-[20px] border border-slate-200 object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-50 text-cyan-700"><UserRound className="h-8 w-8" /></div>}<div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Caregiver</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{assignedCaregiver?.full_name || "Assignment pending"}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{assignedCaregiver?.skills.length ? assignedCaregiver.skills.join(", ") : "Caregiver details will appear here once assignment is complete."}</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <DetailTile label="Experience" value={assignedCaregiver?.experience ? `${assignedCaregiver.experience} years` : "Not shared"} />
                <DetailTile label="Rating" value={assignedCaregiver?.rating ? `${assignedCaregiver.rating.toFixed(1)} / 5` : "Not rated yet"} />
                <DetailTile label="Gender" value={assignedCaregiver?.gender ? assignedCaregiver.gender : preferredGender && preferredGender !== "any" ? `Preferred ${preferredGender}` : "No preference"} />
                <DetailTile label="Distance" value={assignedDistanceKm !== null ? `${assignedDistanceKm.toFixed(1)} km away` : "Distance not available"} />
              </div>
              {assignmentReason ? (
                <div className="mt-4 rounded-[18px] border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-900">
                  {assignmentReason}
                </div>
              ) : status === "pending" ? (
                <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  No caregiver available within selected range. Try increasing range.
                </div>
              ) : null}
              {allDocuments.length ? <div className="mt-5 grid gap-2">{allDocuments.map((document) => <DocumentLink key={document.id} document={document} onOpen={setSelectedDocument} />)}</div> : null}
            </section>
          </aside>
        </section>

        <Dialog open={Boolean(selectedDocument)} onOpenChange={(open) => (!open ? setSelectedDocument(null) : null)}>
          <DialogContent className="max-w-5xl border-slate-200 bg-white p-0 text-slate-950">
            <DialogHeader className="border-b border-slate-200 px-6 py-5">
              <DialogTitle className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{selectedDocument?.file_name ?? "Document preview"}</DialogTitle>
              <DialogDescription className="text-slate-500">Previewing the caregiver {selectedDocument?.document_type?.replaceAll("_", " ") ?? "document"}.</DialogDescription>
            </DialogHeader>
            <div className="px-6 py-6">{selectedDocumentUrl ? isImageDocument(selectedDocument?.file_name) ? <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50"><img src={selectedDocumentUrl} alt={selectedDocument?.file_name ?? "Document preview"} className="max-h-[75vh] w-full object-contain" /></div> : <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white"><iframe src={selectedDocumentUrl} title={selectedDocument?.file_name ?? "Document preview"} className="h-[75vh] w-full" /></div> : null}</div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white p-2.5 text-cyan-700"><Icon className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-1 text-base font-semibold text-slate-950">{value}</p></div></div></div>;
}

function MapStatusCard({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-[18px] border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-75">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-5">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div>;
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-sm text-slate-500">{label}</p><p className="text-sm font-semibold text-slate-950">{value}</p></div>;
}

function DocumentLink({ document, onOpen }: { document: CaregiverDocumentSummary; onOpen: (document: CaregiverDocumentSummary) => void }) {
  return <button type="button" onClick={() => onOpen(document)} className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4 text-left text-sm font-medium text-slate-900 transition hover:border-cyan-200 hover:bg-cyan-50"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700">{document.document_type.replaceAll("_", " ")}</p><p className="mt-2 break-words text-sm leading-6 text-slate-900">{document.file_name}</p></button>;
}
