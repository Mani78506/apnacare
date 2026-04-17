import { ArrowRight, CircleOff, Clock3, IndianRupee, UserRound } from "lucide-react";
import { BookingSummary } from "@/store/useCaregiverStore";
import { formatDurationPlan, getDurationProgress } from "@/lib/utils";

interface JobCardProps {
  booking: BookingSummary;
  loading?: boolean;
  refreshing?: boolean;
  onStart: () => void;
  onReject: () => void;
}

const statusTone: Record<string, string> = {
  assigned: "bg-amber-50 text-amber-700 border-amber-200",
  on_the_way: "bg-cyan-50 text-cyan-700 border-cyan-200",
  arrived: "bg-emerald-50 text-emerald-700 border-emerald-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function JobCard({ booking, loading, refreshing, onStart, onReject }: JobCardProps) {
  const primaryActionLabel = booking.status === "assigned" ? "Start Job" : "Resume Job";
  const money = (value?: number | null) => `Rs. ${(value ?? 0).toFixed(2)}`;
  const progress = getDurationProgress({
    durationType: booking.duration_type,
    hours: booking.hours,
    days: booking.days,
    months: booking.months,
    startTime: booking.start_time,
    endTime: booking.end_time,
  });

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.32em] text-slate-600">
              Assigned Booking
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone[booking.status] ?? statusTone.assigned}`}>
              {booking.status.replaceAll("_", " ")}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
              {refreshing ? "Syncing" : "Stable"}
            </span>
          </div>

          <div>
            <p className="text-sm text-slate-500">Booking ID</p>
            <p className="text-3xl font-semibold text-slate-950">#{booking.id}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <UserRound className="h-4 w-4" />
                Patient
              </div>
              <p className="text-lg font-medium text-slate-950">{booking.patient_name || `Patient #${booking.patient_id}`}</p>
              {booking.patient_age ? <p className="mt-1 text-sm text-slate-500">{booking.patient_age} years</p> : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <Clock3 className="h-4 w-4" />
                Scheduled
              </div>
              <p className="text-lg font-medium text-slate-950">
                {booking.start_time ? new Date(booking.start_time).toLocaleString() : "As soon as possible"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <IndianRupee className="h-4 w-4" />
                Booking amount
              </div>
              <p className="text-lg font-medium text-slate-950">{money(booking.amount)}</p>
              <p className="mt-1 text-sm text-slate-500">Payment {booking.payment_status || "pending"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <Clock3 className="h-4 w-4" />
                Duration plan
              </div>
              <p className="text-lg font-medium text-slate-950">{formatDurationPlan(booking.duration_type, booking.hours, booking.days, booking.months)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {progress.completed}/{progress.total} {progress.unitLabel} done, {progress.left} left
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-cyan-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Care Instructions</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {booking.notes?.trim() || "No custom medicine or patient care instructions were added."}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Prescription</p>
              <p className="mt-2 text-sm text-slate-700">
                {booking.has_prescription
                  ? booking.prescription_file_name || "Prescription uploaded"
                  : "No prescription file uploaded for this booking."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:w-full sm:max-w-xs">
          <button
            type="button"
            onClick={onStart}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {primaryActionLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject Job
            <CircleOff className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
