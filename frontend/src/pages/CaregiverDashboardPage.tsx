import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Bell, ClipboardList, MapPinned, ShieldAlert, Sparkles, Wallet } from "lucide-react";

import CaregiverNavbar from "@/components/CaregiverNavbar";
import JobCard from "@/components/JobCard";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCaregiverAuth } from "@/hooks/useCaregiverAuth";
import {
  AppNotification,
  BookingSummary,
  bookingAPI,
  caregiverAPI,
  CaregiverEarningsSummary,
  CaregiverHistoryItem,
  CaregiverPerformanceSummary,
  CaregiverProfileSummary,
  CaregiverReviewItem,
} from "@/lib/api";
import { formatDurationPlan, getDurationProgress } from "@/lib/utils";
import { CaregiverUser, useCaregiverStore } from "@/store/useCaregiverStore";

const money = (v?: number | null) => `Rs. ${(v ?? 0).toFixed(2)}`;
const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : "Not scheduled");
type WorkspaceView = "overview" | "history" | "notifications" | "profile";

export default function CaregiverDashboardPage() {
  const navigate = useNavigate();
  const { logout } = useCaregiverAuth();
  const { currentBooking, setCurrentBooking, setUser, user } = useCaregiverStore();
  const baseUser: CaregiverUser = user ?? { id: 0, name: "Caregiver", email: "", role: "caregiver" };
  const [profile, setProfile] = useState<CaregiverProfileSummary | null>(null);
  const [earnings, setEarnings] = useState<CaregiverEarningsSummary | null>(null);
  const [performance, setPerformance] = useState<CaregiverPerformanceSummary | null>(null);
  const [reviews, setReviews] = useState<CaregiverReviewItem[]>([]);
  const [history, setHistory] = useState<CaregiverHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>("overview");

  const approvalStatus = profile?.status || user?.caregiver_status || "pending";
  const isAvailable = Boolean(profile?.is_available);

  const loadDashboard = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const [me, latest, earningsRes, performanceRes, reviewsRes, historyRes, notificationsRes] = await Promise.all([
        caregiverAPI.getMe(),
        bookingAPI.getLatest(),
        caregiverAPI.getEarningsSummary(),
        caregiverAPI.getPerformance(),
        caregiverAPI.getReviews(),
        caregiverAPI.getHistory(),
        caregiverAPI.getNotifications(),
      ]);

      const caregiver = me.data.caregiver;
      setProfile(caregiver);
      setCurrentBooking((latest.data.booking as BookingSummary | null) ?? null);
      setEarnings(earningsRes.data);
      setPerformance(performanceRes.data);
      setReviews(reviewsRes.data.reviews ?? []);
      setHistory(historyRes.data.history ?? []);
      setNotifications(notificationsRes.data.notifications ?? []);
      setUser({
        ...baseUser,
        caregiver_id: caregiver.id,
        caregiver_status: caregiver.status,
        caregiver_verified: caregiver.is_verified,
      });
      setLastUpdated(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to load caregiver dashboard.");
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
    const interval = window.setInterval(() => void loadDashboard(true), 15000);
    return () => window.clearInterval(interval);
  }, []);

  const rejectBooking = async () => {
    if (!currentBooking) return;
    setBusy("reject");
    try {
      await caregiverAPI.rejectBooking(currentBooking.id);
      await loadDashboard(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to reject the booking.");
    } finally {
      setBusy(null);
    }
  };

  const toggleAvailability = async (checked: boolean) => {
    setBusy("availability");
    try {
      const address = profile?.address || profile?.location || "";
      let latitude: number | undefined;
      let longitude: number | undefined;

      if (checked && (!address || profile?.latitude == null || profile?.longitude == null) && !navigator.geolocation) {
        throw new Error("Location is required to go online");
      }

      if (checked && navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              latitude = position.coords.latitude;
              longitude = position.coords.longitude;
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
          );
        });
      }

      await caregiverAPI.updateAvailability({
        caregiver_id: profile?.id,
        is_available: checked,
        address: address || undefined,
        latitude: latitude ?? profile?.latitude ?? undefined,
        longitude: longitude ?? profile?.longitude ?? undefined,
      });
      await loadDashboard(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Unable to update availability.");
    } finally {
      setBusy(null);
    }
  };

  const updateCurrentLocation = async () => {
    if (!profile?.id) return;
    if (!navigator.geolocation) {
      setError("Location permission denied. Please enable GPS/location access.");
      return;
    }

    setBusy("current-location");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await caregiverAPI.updateProfileLocation({
            caregiver_id: profile.id,
            address: profile.address || profile.location || "Current location",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          await loadDashboard(true);
        } catch (err: any) {
          setError(err.response?.data?.detail || "Unable to update current location.");
        } finally {
          setBusy(null);
        }
      },
      () => {
        setError("Location permission denied. Please enable GPS/location access.");
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const markRead = async (id: number) => {
    setBusy(`notification-${id}`);
    try {
      await caregiverAPI.markNotificationRead(id);
      await loadDashboard(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to update notification.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_100%)] text-slate-950">
      <div className="flex min-h-screen">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          showWorkspace
          workspaceView={activeView}
          onWorkspaceChange={setActiveView}
        />
        <div className="flex min-h-screen flex-1 flex-col">
          <CaregiverNavbar
            title="Dispatch Dashboard"
            subtitle="Live jobs, earnings, history, and notifications in one workspace."
            onMenuClick={() => setSidebarOpen(true)}
            onLogout={logout}
          />

          <main className="flex-1 space-y-8 px-4 py-8 md:px-8">
            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-cyan-700">Caregiver operations</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {profile?.full_name || user?.name || "Caregiver"} is {approvalStatus === "approved" ? "ready for dispatch" : "waiting on approval"}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {lastUpdated
                      ? `Last update ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : "Waiting for first sync"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Availability</p>
                    <p className="text-sm font-semibold text-slate-950">{isAvailable ? "Online" : "Offline"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Live badge</p>
                    <p className="text-sm font-semibold text-slate-950">{isAvailable ? "Online" : "Offline"}</p>
                  </div>
                  <Switch
                    checked={isAvailable}
                    disabled={busy === "availability" || approvalStatus !== "approved" || !profile?.is_enabled || Boolean(profile?.forced_offline)}
                    onCheckedChange={(checked) => void toggleAvailability(checked)}
                  />
                  <Button
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={() => void loadDashboard(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? "Syncing..." : "Refresh"}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    onClick={() => void updateCurrentLocation()}
                    disabled={busy === "current-location" || !profile?.id}
                  >
                    <MapPinned className="h-4 w-4" />
                    {busy === "current-location" ? "Updating..." : "Update My Current Location"}
                  </Button>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Current coordinates: {profile?.latitude != null && profile?.longitude != null ? `${profile.latitude.toFixed(5)}, ${profile.longitude.toFixed(5)}` : "Not shared"}
              </p>
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
              <Metric icon={Wallet} label="Today earnings" value={money(earnings?.today_earnings)} />
              <Metric icon={Sparkles} label="Total earnings" value={money(earnings?.total_earnings)} />
              <Metric icon={ClipboardList} label="Completed jobs" value={String(performance?.jobs_completed ?? 0)} />
              <Metric icon={BadgeCheck} label="Average rating" value={`${performance?.average_rating ?? 0} / 5`} />
            </section>

            {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

            {approvalStatus !== "approved" ? (
              <section className="rounded-[32px] border border-amber-200 bg-amber-50 px-6 py-14 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  {approvalStatus === "rejected" ? <ShieldAlert className="h-7 w-7" /> : <BadgeCheck className="h-7 w-7" />}
                </div>
                <p className="mt-5 text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">
                  {approvalStatus === "rejected" ? "Application rejected" : "Waiting for admin approval"}
                </p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-950">
                  {approvalStatus === "rejected" ? "Your caregiver profile needs review again" : "Your caregiver profile is still under review"}
                </h2>
              </section>
            ) : loading ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
                Loading live job details...
              </div>
            ) : activeView === "overview" && currentBooking ? (
              <JobCard
                booking={currentBooking}
                loading={busy === "reject"}
                refreshing={refreshing}
                onStart={() => navigate(`/caregiver/job/${currentBooking.id}`)}
                onReject={rejectBooking}
              />
            ) : activeView === "overview" ? (
              <section className="rounded-[32px] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-[0_16px_50px_rgba(15,23,42,0.04)]">
                <p className="text-sm uppercase tracking-[0.32em] text-cyan-700">Queue Empty</p>
                <h2 className="mt-4 text-3xl font-semibold text-slate-950">No jobs assigned</h2>
                <p className="mx-auto mt-3 max-w-xl text-slate-500">Stay online and keep this dashboard open to receive the next booking.</p>
              </section>
            ) : null}

            <section>
              {activeView === "history" ? (
                <Panel title="Job history" icon={MapPinned}>
                  <div className="space-y-3">
                    {history.length ? (
                      history.slice(0, 6).map((item) => {
                        const progress = getDurationProgress({
                          durationType: item.duration_type,
                          hours: item.hours,
                          days: item.days,
                          months: item.months,
                          startTime: item.start_time,
                          endTime: item.end_time,
                        });

                        return (
                          <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">Booking #{item.id}</p>
                                <p className="text-sm text-slate-500">
                                  {item.patient_name || "Patient"} / {item.service_type || "General care"}
                                </p>
                              </div>
                              <p className="text-sm font-semibold text-cyan-700">{money(item.earning)}</p>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-3">
                              <Mini label="Status" value={item.status.replaceAll("_", " ")} />
                              <Mini label="Payment" value={item.payment_status} />
                              <Mini label="Plan" value={formatDurationPlan(item.duration_type, item.hours, item.days, item.months)} />
                              <Mini label="Completed" value={`${progress.completed} ${progress.unitLabel}`} />
                              <Mini label="Left" value={`${progress.left} ${progress.unitLabel}`} />
                              <Mini label="Booking amount" value={money(item.amount)} />
                              <Mini label="Your earning" value={money(item.earning)} />
                              <Mini label="Scheduled" value={when(item.start_time)} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-500">No completed or assigned job history yet.</p>
                    )}
                  </div>
                </Panel>
              ) : null}

              {activeView === "notifications" ? (
                <Panel title="Notifications" icon={Bell}>
                  <div className="space-y-3">
                    {notifications.length ? (
                      notifications.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                          <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                              {item.created_at ? new Date(item.created_at).toLocaleString() : "Recent"}
                            </p>
                            {!item.is_read ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                                disabled={busy === `notification-${item.id}`}
                                onClick={() => void markRead(item.id)}
                              >
                                Mark read
                              </Button>
                            ) : (
                              <span className="text-xs uppercase tracking-[0.18em] text-emerald-600">Read</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No notifications yet.</p>
                    )}
                  </div>
                </Panel>
              ) : null}

              {activeView === "profile" ? (
                <Panel title="Profile and performance" icon={ShieldAlert}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Mini label="Full name" value={profile?.full_name || user?.name || "Caregiver"} />
                    <Mini label="Address" value={profile?.address || profile?.location || "No address"} />
                    <Mini label="Gender" value={profile?.gender ? profile.gender : "Not provided"} />
                    <Mini label="Coordinates" value={profile?.latitude !== undefined && profile?.latitude !== null && profile?.longitude !== undefined && profile?.longitude !== null ? `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)}` : "Not shared"} />
                    <Mini label="Experience" value={profile?.experience ? `${profile.experience} years` : "Not provided"} />
                    <Mini label="Verification" value={profile?.is_verified ? "Verified" : "Pending"} />
                    <Mini label="Skills" value={profile?.skills.length ? profile.skills.join(", ") : "No skills listed"} />
                    <Mini label="Pending payouts" value={money(earnings?.pending_payouts)} />
                    <Mini label="Jobs completed" value={String(performance?.jobs_completed ?? 0)} />
                    <Mini label="Average rating" value={`${performance?.average_rating ?? 0} / 5`} />
                  </div>
                  <div className="mt-5">
                    <h3 className="text-lg font-semibold text-slate-950">Patient ratings and reviews</h3>
                    <div className="mt-3 space-y-3">
                      {reviews.length ? (
                        reviews.map((item) => (
                          <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-slate-950">
                                  {item.patient_name || "Patient"} / Booking #{item.booking_id}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                                  {item.created_at ? new Date(item.created_at).toLocaleString() : "Recent"}
                                </p>
                              </div>
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">
                                {item.rating} / 5
                              </span>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-700">
                              {item.comment?.trim() || "No written feedback provided."}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">No patient reviews yet.</p>
                      )}
                    </div>
                  </div>
                </Panel>
              ) : null}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_16px_50px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-medium leading-6 text-slate-950">{value}</p>
    </div>
  );
}
