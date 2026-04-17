import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Activity, CheckCircle2, Clock3, MapPinned, Navigation, Radio, Route, ShieldAlert, UserRound } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import CaregiverNavbar from "@/components/CaregiverNavbar";
import api, { bookingAPI, caregiverAPI, getTrackingWebSocketUrl } from "@/lib/api";
import { useLocation as useLiveLocation } from "@/hooks/useLocation";
import { BookingSummary, CaregiverUser, useCaregiverStore } from "@/store/useCaregiverStore";
import { formatLabel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const actionConfig: Record<string, Array<{ label: string; status: string; tone: string }>> = {
  assigned: [
    { label: "Accept Job", status: "accepted", tone: "bg-cyan-400 text-slate-950 hover:bg-cyan-300" },
    { label: "Reject Job", status: "rejected", tone: "bg-rose-400/15 text-rose-200 hover:bg-rose-400/20" },
  ],
  accepted: [
    { label: "Start Route", status: "on_the_way", tone: "bg-cyan-400 text-slate-950 hover:bg-cyan-300" },
    { label: "Reject Job", status: "rejected", tone: "bg-rose-400/15 text-rose-200 hover:bg-rose-400/20" },
  ],
  on_the_way: [
    { label: "Mark Arrived", status: "arrived", tone: "bg-emerald-400 text-slate-950 hover:bg-emerald-300" },
  ],
  started: [
    { label: "Complete Job", status: "completed", tone: "bg-violet-400 text-slate-950 hover:bg-violet-300" },
  ],
};

interface TaskItem {
  id: number;
  task_name?: string;
  name?: string;
  completed?: boolean;
  status?: string;
}

export default function CaregiverJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { caregiverId, currentBooking, setCurrentBooking, liveLocation, setLiveLocation, setUser, user } = useCaregiverStore();
  const baseUser: CaregiverUser = user ?? { id: 0, name: "Caregiver", email: "", role: "caregiver" };
  const [booking, setBooking] = useState<BookingSummary | null>(currentBooking);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tasksRefreshing, setTasksRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const taskRequestKeyRef = useRef<number | null>(null);
  const approvalStatus = user?.caregiver_status ?? "pending";

  const bookingId = id ? Number(id) : null;
  const activeBookingId = booking?.id ?? bookingId;
  const sharingEnabled = Boolean(
    bookingId &&
    caregiverId &&
    booking &&
    ["accepted", "on_the_way", "arrived", "started"].includes(booking.status)
  );

  const { permissionError, isSharing } = useLiveLocation({
    caregiverId,
    bookingId,
    enabled: sharingEnabled,
  });

  useEffect(() => {
    const syncCaregiverProfile = async () => {
      try {
        const response = await caregiverAPI.getMe();
        const caregiver = response.data.caregiver;
        setUser({
          ...baseUser,
          caregiver_id: caregiver.id,
          caregiver_status: caregiver.status,
          caregiver_verified: caregiver.is_verified,
        });
      } catch {
        // Keep current status if profile polling fails.
      }
    };

    if (approvalStatus !== "approved") {
      setLoading(false);
      setCurrentBooking(null);
      return;
    }

    const loadBooking = async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await bookingAPI.getLatest();
        const nextBooking = (response.data.booking as BookingSummary | null) ?? null;
        setBooking(nextBooking);
        setCurrentBooking(nextBooking);
        setLastUpdated(new Date());
        if (error) {
          setError(null);
        }

        if (!nextBooking) {
          setError("No active job is currently assigned to you.");
          return;
        }

        if (bookingId && nextBooking.id !== bookingId) {
          setError("This job is not currently assigned to you.");
        }
      } catch (err: any) {
        const message = err.response?.data?.detail || "Unable to load the job.";
        setError(silent ? `Live refresh paused. ${message}` : message);
      } finally {
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

    void syncCaregiverProfile();
    void loadBooking();
    const interval = window.setInterval(() => {
      void syncCaregiverProfile();
      void loadBooking({ silent: true });
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [approvalStatus, bookingId, setCurrentBooking]);

  useEffect(() => {
    if (!bookingId || approvalStatus !== "approved") return;

    const socket = new WebSocket(getTrackingWebSocketUrl(bookingId));
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.status) {
          setBooking((current) => (current ? { ...current, status: payload.status, otp_verified: payload.status === "started" ? true : current.otp_verified } : current));
          setCurrentBooking((current) => (current ? { ...current, status: payload.status, otp_verified: payload.status === "started" ? true : current.otp_verified } : current));
        }
        if (typeof payload.lat === "number" && typeof payload.lng === "number") {
          setLiveLocation({ lat: payload.lat, lng: payload.lng });
        }
      } catch (parseError) {
        console.error("Caregiver job websocket parse error", parseError);
      }
    };

    return () => {
      socket.close();
    };
  }, [approvalStatus, bookingId, setCurrentBooking, setLiveLocation]);

  useEffect(() => {
    if (approvalStatus !== "approved" || !activeBookingId || !booking) {
      setTasks([]);
      taskRequestKeyRef.current = null;
      return;
    }

    const caregiverToken = localStorage.getItem("apnacare_caregiver_token");
    const headers = caregiverToken ? { Authorization: `Bearer ${caregiverToken}` } : {};
    const isSameTaskSet = taskRequestKeyRef.current === activeBookingId;

    const loadTasks = async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setTasksRefreshing(true);
      } else {
        setTasksLoading(true);
      }

      try {
        const response = await api.get(`/task/${activeBookingId}`, { headers });
        const payload = Array.isArray(response.data) ? response.data : response.data?.tasks ?? [];
        setTasks(Array.isArray(payload) ? payload : []);
        taskRequestKeyRef.current = activeBookingId;
        if (taskError) {
          setTaskError(null);
        }
      } catch (err: any) {
        if (!silent) {
          setTasks([]);
        }
        setTaskError(err.response?.data?.detail || "Unable to load the task checklist.");
      } finally {
        if (silent) {
          setTasksRefreshing(false);
        } else {
          setTasksLoading(false);
        }
      }
    };

    void loadTasks({ silent: isSameTaskSet });
  }, [activeBookingId, approvalStatus]);

  const updateStatus = async (status: string) => {
    if (!bookingId) return;
    setUpdatingStatus(status);
    setError(null);
    try {
      await caregiverAPI.updateStatus({ booking_id: bookingId, status });
      setBooking((current) => (current ? { ...current, status } : current));
      setCurrentBooking((current) => (current ? { ...current, status } : current));
      toast.info("Status updated");

      if (status === "completed" || status === "rejected") {
        setCurrentBooking(null);
        navigate("/caregiver/dashboard", { replace: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to update status.");
    } finally {
      setUpdatingStatus(null);
    }
  };

  const verifyOtp = async () => {
    if (!bookingId || !enteredOtp.trim()) {
      toast.error("Enter the patient OTP first.");
      return;
    }

    setVerifyingOtp(true);
    setError(null);
    try {
      const response = await bookingAPI.verifyOtp({ booking_id: bookingId, entered_otp: enteredOtp.trim() });
      const nextStatus = response.data.status || "started";
      setBooking((current) => (current ? { ...current, status: nextStatus, otp_verified: true } : current));
      setCurrentBooking((current) => (current ? { ...current, status: nextStatus, otp_verified: true } : current));
      toast.success("Caregiver verified");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "OTP verification failed.");
      setError(err.response?.data?.detail || "OTP verification failed.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const openPrescription = async () => {
    if (!booking?.id || !booking.has_prescription) {
      toast.error("No prescription uploaded for this booking.");
      return;
    }

    try {
      const response = await bookingAPI.downloadPrescription(booking.id, "caregiver");
      const objectUrl = window.URL.createObjectURL(response.data);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to open the prescription.");
    }
  };

  const completeTask = async (taskId: number) => {
    const caregiverToken = localStorage.getItem("apnacare_caregiver_token");
    const headers = caregiverToken ? { Authorization: `Bearer ${caregiverToken}` } : {};

    setUpdatingTaskId(taskId);
    setTaskError(null);
    try {
      await api.post(`/task/update/${taskId}`, {}, { headers });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                completed: true,
                status: "completed",
              }
            : task,
        ),
      );
    } catch (err: any) {
      setTaskError(err.response?.data?.detail || "Unable to update the task.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const statusLabel = useMemo(() => formatLabel(booking?.status) || "Assigned", [booking?.status]);
  const actions = booking ? actionConfig[booking.status] ?? [] : [];
  const scheduledLabel = booking?.start_time ? new Date(booking.start_time).toLocaleString() : "As soon as possible";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen flex-1 flex-col">
          <CaregiverNavbar
            title={booking ? `Job #${booking.id}` : "Active Job"}
            subtitle="Manage route progress, live location, and patient handoff status."
            onMenuClick={() => setSidebarOpen(true)}
          />
          <main className="flex-1 space-y-8 px-4 py-8 md:px-8">
            <section className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Live job session</p>
                <p className="mt-1 text-sm text-slate-300">
                  Background refresh is now silent, so this page stays stable while the route and status keep syncing.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-slate-200">
                  <Radio className={`h-4 w-4 ${refreshing ? "animate-pulse text-cyan-300" : "text-emerald-300"}`} />
                  {refreshing ? "Syncing live job" : "Live job stable"}
                </div>
                <div className="text-slate-400">
                  {lastUpdated
                    ? `Last update ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Waiting for first job sync"}
                </div>
              </div>
            </section>

            {error && <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
            {permissionError && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Geolocation issue: {permissionError}
              </div>
            )}

            {approvalStatus !== "approved" ? (
              <div className="rounded-[32px] border border-amber-400/20 bg-amber-400/10 p-10 text-center">
                <ShieldAlert className="mx-auto h-10 w-10 text-amber-200" />
                <h2 className="mt-4 text-2xl font-semibold text-white">Waiting for admin approval</h2>
                <p className="mt-2 text-slate-300">
                  Job controls stay locked until your caregiver profile is approved. Return to the dashboard and wait for verification.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/caregiver/dashboard")}
                  className="mt-6 rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
                >
                  Go to dashboard
                </button>
              </div>
            ) : loading ? (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-10 text-center text-slate-300">
                Loading active job...
              </div>
            ) : booking ? (
              <>
                <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                  <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-cyan-500/10 via-slate-900 to-slate-950 p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.32em] text-cyan-200">
                        Live Job Control
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm text-slate-300">
                        Status: {statusLabel}
                      </div>
                    </div>
                    <div className="mt-6 grid gap-4 sm:grid-cols-4">
                      <MetricCard icon={Navigation} label="Booking ID" value={`#${booking.id}`} />
                      <MetricCard icon={UserRound} label="Patient" value={booking.patient_name || `#${booking.patient_id}`} />
                      <MetricCard icon={Clock3} label="Scheduled" value={scheduledLabel} compact />
                      <MetricCard icon={Activity} label="Location Sharing" value={isSharing ? "Active" : "Pending"} />
                    </div>
                  </div>

                  <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                    <p className="text-sm uppercase tracking-[0.32em] text-cyan-300">Live coordinates</p>
                    <div className="mt-6 space-y-5">
                      <div>
                        <p className="text-sm text-slate-400">Current location</p>
                        <p className="mt-1 text-2xl font-semibold text-white">
                          {liveLocation ? `${liveLocation.lat.toFixed(5)}, ${liveLocation.lng.toFixed(5)}` : "Waiting for GPS fix"}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
                        Coordinates are pushed to ApnaCare every 5 seconds while this page is open.
                      </div>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <UserRound className="h-5 w-5 text-cyan-300" />
                      <div>
                        <h2 className="text-xl font-semibold text-white">Patient care brief</h2>
                        <p className="text-sm text-slate-400">Follow these instructions when you begin the visit.</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Condition</p>
                        <p className="mt-2 text-sm text-slate-200">{formatLabel(booking.patient_condition) || "Not specified"}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Instructions and medicines</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                          {booking.notes?.trim() || "No special medicine or care instructions were added by the patient."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Prescription</p>
                        <p className="mt-2 text-sm text-slate-300">
                          {booking.has_prescription
                            ? booking.prescription_file_name || "Prescription uploaded"
                            : "No prescription file uploaded for this booking."}
                        </p>
                        {booking.has_prescription ? (
                          <button
                            type="button"
                            onClick={() => void openPrescription()}
                            className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                          >
                            Open prescription
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 text-amber-300" />
                      <div>
                        <h2 className="text-xl font-semibold text-white">OTP verification</h2>
                        <p className="text-sm text-slate-400">Verify the patient handoff before care starts.</p>
                      </div>
                    </div>
                    {booking.status === "arrived" && !booking.otp_verified ? (
                      <div className="space-y-4">
                        <Input
                          value={enteredOtp}
                          onChange={(event) => setEnteredOtp(event.target.value.replace(/\D/g, "").slice(0, 4))}
                          placeholder="Enter OTP"
                          className="h-12 rounded-2xl border-white/10 bg-slate-950/60 text-white"
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          onClick={() => void verifyOtp()}
                          disabled={verifyingOtp}
                          className="rounded-2xl bg-violet-400 px-4 py-4 text-sm font-semibold text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {verifyingOtp ? "Verifying..." : "Verify OTP"}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                        {booking.otp_verified
                          ? "OTP verified. Service has started and the job can continue normally."
                          : "OTP verification becomes available after you mark the job as arrived."}
                      </div>
                    )}
                  </div>

                  <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <Route className="h-5 w-5 text-cyan-300" />
                      <div>
                        <h2 className="text-xl font-semibold text-white">Status updates</h2>
                        <p className="text-sm text-slate-400">Advance the patient journey with explicit job actions.</p>
                      </div>
                    </div>
                    {actions.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {actions.map((button) => (
                          <button
                            key={button.label}
                            type="button"
                            disabled={Boolean(updatingStatus)}
                            onClick={() => void updateStatus(button.status)}
                            className={`rounded-2xl px-4 py-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${button.tone}`}
                          >
                            {updatingStatus === button.status ? "Updating..." : button.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                        No further actions are available for this job right now.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                    <div className="mb-5 flex items-center gap-3">
                      <MapPinned className="h-5 w-5 text-emerald-300" />
                      <div>
                        <h2 className="text-xl font-semibold text-white">Operational notes</h2>
                        <p className="text-sm text-slate-400">Use this as the caregiver's live trip console.</p>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm text-slate-300">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        Keep this page open during transit so location syncing stays active.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        Start the route first, then mark the job as arrived once you reach the patient location.
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        Complete or reject the job to release the caregiver back into the dispatch queue.
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6">
                  <div className="mb-5 flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-cyan-300" />
                    <div>
                      <h2 className="text-xl font-semibold text-white">Task checklist</h2>
                      <p className="text-sm text-slate-400">Complete patient care tasks as the visit progresses.</p>
                    </div>
                  </div>

                  {taskError && (
                    <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                      {taskError}
                    </div>
                  )}

                  {tasksLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                      Loading task checklist...
                    </div>
                  ) : tasks.length ? (
                    <div className="grid gap-3">
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                        <span>{tasksRefreshing ? "Refreshing checklist..." : "Checklist ready"}</span>
                        <span>{tasks.filter((task) => task.completed || task.status === "completed").length}/{tasks.length} done</span>
                      </div>
                      {tasks.map((task) => {
                        const taskLabel = task.task_name || task.name || `Task #${task.id}`;
                        const isDone = Boolean(task.completed || task.status === "completed");

                        return (
                          <div key={task.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="font-medium text-white">{taskLabel}</p>
                              <p className="text-sm text-slate-400">Task ID #{task.id}</p>
                            </div>
                            {isDone ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
                                Done
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={updatingTaskId === task.id}
                                onClick={() => void completeTask(task.id)}
                                className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {updatingTaskId === task.id ? "Updating..." : "Complete"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                      No tasks have been assigned to this booking yet.
                    </div>
                  )}
                </section>
              </>
            ) : (
              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-10 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300" />
                <h2 className="mt-4 text-2xl font-semibold">No active job found</h2>
                <p className="mt-2 text-slate-400">Return to the dashboard to wait for the next assignment.</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: typeof Navigation;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-4">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-cyan-300">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`mt-1 font-semibold text-white ${compact ? "text-sm" : "text-lg"}`}>{value}</p>
    </div>
  );
}
