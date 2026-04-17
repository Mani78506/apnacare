import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, CheckCircle2, Clock, History, MapPin, Shield, Sparkles, Stethoscope, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import { bookingAPI, BookingSummary, getCaregiverDocumentUrl } from "@/lib/api";

const features = [
  { icon: Clock, title: "Quick booking", desc: "Book a caregiver in a few guided steps without filling a complicated form." },
  { icon: MapPin, title: "Live tracking", desc: "Follow caregiver arrival in real time once the booking is assigned." },
  { icon: Shield, title: "Verified professionals", desc: "Caregivers are background-verified before they appear in the system." },
];

const activeStatuses = new Set(["assigned", "on_the_way", "arrived"]);
const statusTone: Record<string, string> = {
  assigned: "bg-cyan-100 text-cyan-800 border-cyan-200",
  on_the_way: "bg-amber-100 text-amber-800 border-amber-200",
  arrived: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-slate-200 text-slate-700 border-slate-200",
  rejected: "bg-rose-100 text-rose-700 border-rose-200",
  pending: "bg-slate-100 text-slate-700 border-slate-200",
};
const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  on_the_way: "On the way",
  arrived: "Arrived",
  completed: "Completed",
  rejected: "Rejected",
  pending: "Pending",
};

function formatBookingDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "As soon as possible";
}

export default function HomePage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submittingReviewId, setSubmittingReviewId] = useState<number | null>(null);
  const [reviewBooking, setReviewBooking] = useState<BookingSummary | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: "5", comment: "" });

  useEffect(() => {
    const loadBookings = async () => {
      setLoadingBookings(true);
      setBookingError(null);
      try {
        const response = await bookingAPI.getMine();
        setBookings(response.data.bookings ?? []);
      } catch (error: any) {
        setBookingError(error.response?.data?.detail || "Unable to load your bookings.");
      } finally {
        setLoadingBookings(false);
      }
    };

    void loadBookings();
  }, []);

  const activeBooking = useMemo(
    () => bookings.find((booking) => activeStatuses.has(booking.status)),
    [bookings]
  );
  const historicalBookings = useMemo(
    () => bookings.filter((booking) => booking.id !== activeBooking?.id),
    [activeBooking?.id, bookings]
  );
  const completedBookings = useMemo(
    () => bookings.filter((booking) => booking.status === "completed").length,
    [bookings]
  );
  const reviewProfilePhoto = reviewBooking?.caregiver?.documents.find((document) => document.document_type === "profile") ?? null;

  const submitReview = async () => {
    if (!reviewBooking) return;

    const rating = Number(reviewForm.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      toast.error("Use a rating between 1 and 5.");
      return;
    }

    setSubmittingReviewId(reviewBooking.id);
    try {
      const response = await bookingAPI.submitReview({
        booking_id: reviewBooking.id,
        rating,
        comment: reviewForm.comment.trim(),
      });
      setBookings((current) =>
        current.map((item) =>
          item.id === reviewBooking.id
            ? { ...item, has_review: true, review: response.data.review }
            : item
        )
      );
      toast.success("Review saved in patient portal.");
      setReviewBooking(null);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Unable to submit review.");
    } finally {
      setSubmittingReviewId(null);
    }
  };

  const openReviewDialog = (booking: BookingSummary) => {
    setReviewBooking(booking);
    setReviewForm({
      rating: booking.review?.rating ? String(booking.review.rating) : "5",
      comment: booking.review?.comment || "",
    });
    toast.success("Review form opened.");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)]">
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        <section className="grid gap-8 rounded-[34px] border border-slate-200/80 bg-white/85 p-6 shadow-[0_28px_100px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:p-8">
          <div className="animate-slide-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
              <Sparkles className="h-4 w-4" />
              Patient Experience
            </div>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[0.96] tracking-[-0.05em] text-slate-950 md:text-6xl">
              Home healthcare support designed for families who need clarity, speed, and trust.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              ApnaCare helps you book dependable caregivers, stay informed during arrival, and manage care requests in
              one place built for real patient needs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 rounded-full px-6 text-base shadow-lg" onClick={() => navigate("/booking")}>
                Book a caregiver
                <ArrowRight className="h-4 w-4" />
              </Button>
              {activeBooking ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full px-6 text-base"
                  onClick={() => navigate(`/tracking/${activeBooking.id}`)}
                >
                  Resume tracking
                </Button>
              ) : null}
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <StatCard label="Families supported" value="10k+" />
              <StatCard label="Care status updates" value="Live" />
              <StatCard label="Support desk" value="24/7" />
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-cyan-300">
                <Stethoscope className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold">Every care request follows a clear path.</h2>
              <div className="mt-5 space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">1. Book the required visit with patient details and schedule.</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">2. Receive caregiver assignment and arrival tracking instantly.</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">3. Monitor progress until the caregiver reaches your location.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="rounded-[28px] border-slate-200/80 bg-white/85 shadow-[0_20px_70px_rgba(15,23,42,0.06)]">
              <CardContent className="space-y-3 pt-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-slate-950">{f.title}</h3>
                <p className="text-sm leading-7 text-slate-600">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-8 overflow-hidden rounded-[36px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,250,255,0.96))] p-6 shadow-[0_24px_90px_rgba(15,23,42,0.08)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-700">Your bookings</p>
              <h2 className="mt-2 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Keep every care request visible, with the live visit surfaced first.
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Your active booking stays highlighted, and previous visits remain available as a clean care history instead of a long flat list.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <SummaryChip label="Total bookings" value={String(bookings.length)} />
              <SummaryChip label="Completed" value={String(completedBookings)} />
              <SummaryChip label="Live now" value={activeBooking ? "1" : "0"} accent={Boolean(activeBooking)} />
            </div>
          </div>

          {bookingError ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{bookingError}</div>
          ) : loadingBookings ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Loading your bookings...
            </div>
          ) : bookings.length ? (
            <div className="mt-7 space-y-6">
              {activeBooking ? (
                <div className="rounded-[32px] border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(236,254,255,0.9),rgba(255,255,255,0.95))] p-6 shadow-[0_24px_80px_rgba(8,145,178,0.10)]">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="max-w-2xl">
                      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">
                        <Sparkles className="h-4 w-4" />
                        Active care request
                      </div>
                      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-slate-500">Booking #{activeBooking.id}</p>
                          <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                            {activeBooking.patient_name || `Patient #${activeBooking.patient_id}`}
                          </h3>
                          <p className="mt-2 text-base text-slate-600">
                            {activeBooking.patient_age ? `${activeBooking.patient_age} years old` : "Patient age not provided"}
                          </p>
                        </div>
                        <StatusBadge status={activeBooking.status} />
                      </div>
                      <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                        This visit is still active. Open tracking to follow caregiver movement and keep the latest arrival progress in view.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[460px]">
                      <InfoPanel icon={CalendarClock} label="Scheduled" value={formatBookingDate(activeBooking.start_time)} />
                      <InfoPanel
                        icon={UserRound}
                        label="Caregiver"
                        value={activeBooking.caregiver?.full_name || `ID #${activeBooking.caregiver_id}`}
                      />
                      <InfoPanel icon={MapPin} label="Status" value={statusLabel[activeBooking.status] ?? activeBooking.status} />
                    </div>
                  </div>

                  {activeBooking.caregiver ? (
                    <div className="mt-6 rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Assigned caregiver</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <InfoPanel icon={UserRound} label="Name" value={activeBooking.caregiver.full_name || "Not available"} />
                        <InfoPanel
                          icon={Shield}
                          label="Verification"
                          value={activeBooking.caregiver.is_verified ? "Verified caregiver" : "Verification pending"}
                        />
                        <InfoPanel
                          icon={Sparkles}
                          label="Certificates"
                          value={String(activeBooking.caregiver.documents.filter((doc) => doc.document_type === "certificate").length)}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button className="h-11 rounded-full px-5" onClick={() => navigate(`/tracking/${activeBooking.id}`)}>
                      Resume tracking
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="h-11 rounded-full px-5" onClick={() => navigate("/booking")}>
                      Book another visit
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[30px] border border-emerald-200 bg-[linear-gradient(135deg,rgba(240,253,244,0.95),rgba(255,255,255,0.95))] p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-700">No active visit</p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Everything is calm right now.</h3>
                      <p className="mt-2 max-w-xl text-sm leading-7 text-slate-600">
                        Previous bookings stay below as your care history, and you can start a new request whenever you need support.
                      </p>
                    </div>
                    <Button className="h-11 rounded-full px-5" onClick={() => navigate("/booking")}>
                      Book a caregiver
                    </Button>
                  </div>
                </div>
              )}

              {historicalBookings.length ? (
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <History className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Care history</p>
                      <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Previous requests, organized and easy to scan.</h3>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {historicalBookings.map((booking) => (
                      <HistoryBookingCard
                        key={booking.id}
                        booking={booking}
                        onTrack={() => navigate(`/tracking/${booking.id}`)}
                        onBookAgain={() => navigate("/booking")}
                        onReview={() => openReviewDialog(booking)}
                        reviewLoading={submittingReviewId === booking.id}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 rounded-[30px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <CheckCircle2 className="h-6 w-6 text-cyan-700" />
              </div>
              <p className="mt-5 text-sm font-medium uppercase tracking-[0.22em] text-slate-500">No bookings yet</p>
              <p className="mx-auto mt-3 max-w-xl text-slate-600">
                Once you create a booking, it will appear here as a live care request first and then move into your history automatically.
              </p>
              <Button className="mt-6 h-11 rounded-full px-5" onClick={() => navigate("/booking")}>
                Create first booking
              </Button>
            </div>
          )}
        </section>

        <Dialog open={Boolean(reviewBooking)} onOpenChange={(open) => (!open ? setReviewBooking(null) : null)}>
          <DialogContent className="max-w-lg rounded-[20px] border-slate-200 bg-white p-0">
            <DialogHeader className="border-b border-slate-200 px-6 py-5">
              <DialogTitle className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
                Rate caregiver experience
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-slate-600">
                Share a quick rating and short feedback inside the patient portal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
              <div className="grid gap-3 rounded-[16px] border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                {reviewProfilePhoto ? (
                  <img
                    src={getCaregiverDocumentUrl(reviewProfilePhoto.id)}
                    alt={reviewBooking?.caregiver?.full_name || "Caregiver"}
                    className="h-16 w-16 rounded-[14px] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-slate-200 text-slate-500">
                    <UserRound className="h-7 w-7" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Caregiver review</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">
                    {reviewBooking?.caregiver?.full_name || `Caregiver ID #${reviewBooking?.caregiver_id}`}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">Booking #{reviewBooking?.id}</p>
                </div>
                <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  Completed
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-950">Rating</label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={reviewForm.rating}
                  onChange={(event) => setReviewForm((current) => ({ ...current, rating: event.target.value }))}
                  className="h-11 rounded-[14px] border-slate-200"
                  placeholder="Enter rating from 1 to 5"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-950">Feedback</label>
                <Textarea
                  value={reviewForm.comment}
                  onChange={(event) => setReviewForm((current) => ({ ...current, comment: event.target.value }))}
                  className="min-h-[110px] rounded-[14px] border-slate-200"
                  placeholder="Add short feedback for the caregiver"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200 px-6 py-4">
              <Button variant="outline" className="rounded-full" onClick={() => setReviewBooking(null)}>
                Cancel
              </Button>
              <Button className="rounded-full" onClick={() => void submitReview()} disabled={submittingReviewId === reviewBooking?.id}>
                {submittingReviewId === reviewBooking?.id ? "Saving review..." : "Save review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SummaryChip({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-full border px-4 py-2 text-sm ${accent ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white/90 text-slate-700"}`}>
      <span className="font-semibold">{value}</span> {label}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${statusTone[status] ?? statusTone.pending}`}>
      {statusLabel[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

function InfoPanel({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/80 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{value}</p>
    </div>
  );
}

function HistoryBookingCard({
  booking,
  onTrack,
  onBookAgain,
  onReview,
  reviewLoading,
}: {
  booking: BookingSummary;
  onTrack: () => void;
  onBookAgain: () => void;
  onReview: () => void;
  reviewLoading: boolean;
}) {
  const isActive = activeStatuses.has(booking.status);
  const isCompleted = booking.status === "completed";

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/85 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Booking #{booking.id}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {booking.patient_name || `Patient #${booking.patient_id}`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {booking.patient_age ? `${booking.patient_age} years` : "Age not provided"}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scheduled</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{formatBookingDate(booking.start_time)}</p>
        </div>
        <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Caregiver</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">
            {booking.caregiver?.full_name || `ID #${booking.caregiver_id}`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {isActive ? (
          <Button className="rounded-full" onClick={onTrack}>
            Track booking
          </Button>
        ) : null}
        {isCompleted ? (
          <Button variant="outline" className="rounded-full" onClick={onReview} disabled={reviewLoading}>
            {reviewLoading ? "Saving review..." : booking.has_review ? "Update review" : "Rate caregiver"}
          </Button>
        ) : null}
        <Button variant="outline" className="rounded-full" onClick={onBookAgain}>
          Book again
        </Button>
      </div>
    </div>
  );
}
