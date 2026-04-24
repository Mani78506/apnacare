import { useEffect, useMemo, useState } from "react";
import { Activity, DollarSign, MapPin, RefreshCcw, Search, ShieldAlert, Star, Users } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  adminAPI,
  AdminBookingRecord,
  AdminCaregiverRecord,
  AdminFaceReviewRecord,
  AdminMetricOverview,
  AdminPaymentTransaction,
  AdminReviewRecord,
  AppNotification,
  CaregiverProfileSummary,
  getCaregiverDocumentUrl,
} from "@/lib/api";

type ApprovalFilter = "all" | "pending" | "approved" | "rejected";
type BookingFilter = "all" | "assigned" | "on_the_way" | "arrived" | "completed" | "cancelled";

const money = (v?: number | null) => `Rs. ${(v ?? 0).toFixed(2)}`;
const when = (v?: string | null) => (v ? new Date(v).toLocaleString() : "Not scheduled");
const tone: Record<string, string> = {
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  assigned: "border-cyan-200 bg-cyan-50 text-cyan-800",
  on_the_way: "border-amber-200 bg-amber-50 text-amber-800",
  arrived: "border-emerald-200 bg-emerald-50 text-emerald-800",
  completed: "border-slate-200 bg-slate-100 text-slate-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  manual_override: "border-violet-200 bg-violet-50 text-violet-700",
  matched: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminMetricOverview | null>(null);
  const [approvals, setApprovals] = useState<CaregiverProfileSummary[]>([]);
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([]);
  const [liveJobs, setLiveJobs] = useState<AdminBookingRecord[]>([]);
  const [caregivers, setCaregivers] = useState<AdminCaregiverRecord[]>([]);
  const [transactions, setTransactions] = useState<AdminPaymentTransaction[]>([]);
  const [reviews, setReviews] = useState<AdminReviewRecord[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [earnings, setEarnings] = useState<Array<{ caregiver_name: string | null; earnings: number; email?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [approvalQuery, setApprovalQuery] = useState("");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("all");
  const [bookingQuery, setBookingQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, { caregiverId: string; reason: string }>>({});
  const [faceReviews, setFaceReviews] = useState<Record<number, AdminFaceReviewRecord>>({});

  const load = async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [o, a, b, l, p, c, r, n] = await Promise.all([
        adminAPI.getOverview(),
        adminAPI.getApprovals(),
        adminAPI.getBookings(),
        adminAPI.getLiveJobs(),
        adminAPI.getPaymentsSummary(),
        adminAPI.getCaregiverManagement(),
        adminAPI.getReviews(),
        adminAPI.getNotifications(),
      ]);
      setOverview(o.data);
      setApprovals(a.data.caregivers ?? []);
      setBookings(b.data.bookings ?? []);
      setLiveJobs(l.data.jobs ?? []);
      setTransactions(p.data.transactions ?? []);
      setEarnings(p.data.by_caregiver ?? []);
      setCaregivers(c.data.caregivers ?? []);
      setReviews(r.data.reviews ?? []);
      setNotifications(n.data.notifications ?? []);
      setLastSynced(new Date());
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to load admin workspace.");
    } finally {
      silent ? setRefreshing(false) : setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredApprovals = useMemo(() => approvals.filter((x) => {
    const q = approvalQuery.trim().toLowerCase();
    const hit = [x.full_name, x.email, x.phone, x.address, x.location, x.document_name, x.skills.join(", ")].filter(Boolean).join(" ").toLowerCase();
    return (approvalFilter === "all" || x.status === approvalFilter) && hit.includes(q);
  }), [approvalFilter, approvalQuery, approvals]);

  const filteredBookings = useMemo(() => bookings.filter((x) => {
    const q = bookingQuery.trim().toLowerCase();
    const hit = [x.id, x.patient.name, x.patient.email, x.caregiver.name, x.service_type, x.notes].filter(Boolean).join(" ").toLowerCase();
    return (bookingFilter === "all" || x.status === bookingFilter) && hit.includes(q);
  }), [bookingFilter, bookingQuery, bookings]);

  const eligible = useMemo(() => caregivers.filter((x) => x.status === "approved" && x.is_enabled && !x.forced_offline), [caregivers]);
  const approvalCounts = useMemo(() => ({
    pending: approvals.filter((x) => x.status === "pending").length,
    rejected: approvals.filter((x) => x.status === "rejected").length,
  }), [approvals]);

  const setDraft = (id: number, patch: Partial<{ caregiverId: string; reason: string }>) => setDrafts((s) => ({ ...s, [id]: { caregiverId: s[id]?.caregiverId ?? "", reason: s[id]?.reason ?? "", ...patch } }));
  const act = async (key: string, task: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await task(); toast.success(ok); await load(true); } catch (err: any) { toast.error(err.response?.data?.detail || "Action failed."); } finally { setBusy(null); }
  };
  const loadFaceReview = async (bookingId: number) => {
    setBusy(`face-review-${bookingId}`);
    try {
      const { data } = await adminAPI.getFaceReview(bookingId);
      setFaceReviews((current) => ({ ...current, [bookingId]: data }));
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to load face review.");
    } finally {
      setBusy(null);
    }
  };
  const failedFaceBookings = useMemo(() => bookings.filter((item) => item.face_verification_status === "failed" || item.face_verification_status === "manual_override"), [bookings]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.18),transparent_22%),linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)]">
      <Navbar />
      <main className="container mx-auto max-w-[1400px] px-4 py-6">
        <section className="rounded-[30px] border border-slate-200/80 bg-white/92 shadow-[0_22px_70px_rgba(15,23,42,0.07)] backdrop-blur-xl">
          <div className="border-b border-slate-200/80 px-5 py-5 lg:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-[840px]">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700">Platform control tower</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-slate-950 md:text-4xl">Admin operations, trust, live jobs, and payments in one place.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">This dashboard is now the control layer for bookings, live monitoring, payouts, caregiver controls, and review quality.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">{lastSynced ? `Last synced ${lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for sync"}</div>
                <Button className="h-10 rounded-full px-4 text-sm" onClick={() => void load(true)} disabled={refreshing}><RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? "Refreshing..." : "Refresh"}</Button>
              </div>
            </div>
            {error ? <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
          </div>
          <div className="p-5 lg:p-6">
            {loading ? <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-6 py-14 text-center text-sm text-slate-500">Loading admin workspace...</div> : (
              <Tabs defaultValue="overview" className="space-y-5">
                <TabsList className="h-auto flex-wrap rounded-[18px] bg-slate-100 p-1.5">
                  {["overview", "approvals", "bookings", "live", "payments", "caregivers", "trust"].map((tab) => <TabsTrigger key={tab} value={tab} className="rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] capitalize">{tab}</TabsTrigger>)}
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Metric icon={Activity} label="Active jobs" value={String(overview?.active_bookings ?? 0)} tone="bg-amber-50 text-amber-700" />
                    <Metric icon={Users} label="Active caregivers" value={String(overview?.active_caregivers ?? 0)} tone="bg-emerald-50 text-emerald-700" />
                    <Metric icon={ShieldAlert} label="Pending approvals" value={String(approvalCounts.pending)} tone="bg-cyan-50 text-cyan-700" />
                    <Metric icon={DollarSign} label="Revenue" value={money(overview?.revenue)} tone="bg-slate-950 text-white" />
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <Panel title="Intervention queue" subtitle="What needs action right now">
                      <div className="grid gap-3 md:grid-cols-3">
                        <Signal label="Cancelled bookings" value={String(overview?.cancelled_bookings ?? 0)} />
                        <Signal label="Pending payments" value={String(transactions.filter((x) => x.status !== "paid").length)} />
                        <Signal label="Rejected caregivers" value={String(approvalCounts.rejected)} />
                        <Signal label="Face review queue" value={String(failedFaceBookings.filter((x) => x.face_verification_status === "failed").length)} />
                      </div>
                    </Panel>
                    <Panel title="Admin alerts" subtitle="Latest platform updates" dark>
                      <div className="space-y-3">{notifications.length ? notifications.slice(0, 4).map((x) => <div key={x.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"><p className="text-sm font-semibold text-white">{x.title}</p><p className="mt-1 text-sm leading-6 text-slate-300">{x.message}</p></div>) : <p className="text-sm text-slate-400">No admin notifications yet.</p>}</div>
                    </Panel>
                  </div>
                </TabsContent>

                <TabsContent value="approvals" className="space-y-4">
                  <Toolbar query={approvalQuery} setQuery={setApprovalQuery} filter={approvalFilter} setFilter={setApprovalFilter} items={["all", "pending", "approved", "rejected"]} placeholder="Search by caregiver, email, location, skills, or document" />
                  <div className="grid gap-3">{filteredApprovals.map((x) => <div key={x.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold text-slate-950">{x.full_name || "Unnamed caregiver"}</h3><span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone[x.status]}`}>{x.status}</span></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Cell l="Email" v={x.email || "No email"} /><Cell l="Phone" v={x.phone || "No phone"} /><Cell l="Location" v={x.location || "No location"} /><Cell l="Skills" v={x.skills.length ? x.skills.join(", ") : "No skills"} /><Cell l="Gender" v={x.gender || "Not provided"} /><Cell l="Coordinates" v={x.latitude !== undefined && x.latitude !== null && x.longitude !== undefined && x.longitude !== null ? `${x.latitude.toFixed(4)}, ${x.longitude.toFixed(4)}` : "Not shared"} /><Cell l="Availability" v={x.is_available ? "Online" : "Offline"} /><Cell l="Rating" v={x.rating !== undefined && x.rating !== null ? `${x.rating.toFixed(1)} / 5` : "Not rated"} /></div>{x.documents?.length ? <div className="flex flex-wrap gap-2">{x.documents.map((doc) => <a key={doc.id} href={getCaregiverDocumentUrl(doc.id)} target="_blank" rel="noreferrer" className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-800 hover:bg-cyan-100">{doc.document_type.replaceAll("_", " ")}: {doc.file_name}</a>)}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No uploaded caregiver documents found.</div>}</div><div className="grid gap-2 sm:min-w-[200px]"><Button className="h-10 text-sm" disabled={busy === `approve-${x.id}` || x.status === "approved"} onClick={() => void act(`approve-${x.id}`, () => adminAPI.approveCaregiver(x.id), "Caregiver approved.")}>Verify and approve</Button><Button variant="outline" className="h-10 border-rose-200 text-sm text-rose-700 hover:bg-rose-50" disabled={busy === `reject-${x.id}` || x.status === "rejected"} onClick={() => void act(`reject-${x.id}`, () => adminAPI.rejectCaregiver(x.id), "Caregiver rejected.")}>Reject application</Button></div></div></div>)}</div>
                </TabsContent>

                <TabsContent value="bookings" className="space-y-4">
                  <Toolbar query={bookingQuery} setQuery={setBookingQuery} filter={bookingFilter} setFilter={setBookingFilter} items={["all", "assigned", "on_the_way", "arrived", "completed", "cancelled"]} placeholder="Search by booking, patient, caregiver, service, or note" />
                  <div className="grid gap-3">{filteredBookings.map((x) => { const d = drafts[x.id] ?? { caregiverId: "", reason: "" }; return <div key={x.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="space-y-3"><div className="flex flex-wrap items-center gap-3"><p className="text-xs font-medium text-slate-500">Booking #{x.id}</p><Status value={x.status} /><span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Payment {x.payment_status}</span></div><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Cell l="Patient" v={x.patient.name || "Unknown"} /><Cell l="Caregiver" v={x.caregiver.name || "Unassigned"} /><Cell l="Scheduled" v={when(x.start_time)} /><Cell l="Amount" v={money(x.amount)} /></div><div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{x.notes || "No notes on this booking."}</div></div><div className="grid gap-2 xl:min-w-[290px]"><select className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none" value={d.caregiverId} onChange={(e) => setDraft(x.id, { caregiverId: e.target.value })}><option value="">Auto-pick caregiver</option>{eligible.map((c) => <option key={c.id} value={c.id}>{c.full_name || `Caregiver #${c.id}`}</option>)}</select><Button className="h-10 text-sm" disabled={busy === `reassign-${x.id}` || x.status === "cancelled"} onClick={() => void act(`reassign-${x.id}`, () => adminAPI.reassignBooking(x.id, d.caregiverId ? Number(d.caregiverId) : undefined), "Booking reassigned.")}>Reassign booking</Button><Input value={d.reason} onChange={(e) => setDraft(x.id, { reason: e.target.value })} placeholder="Cancellation reason" className="h-10 rounded-xl border-slate-200 bg-white" /><Button variant="outline" className="h-10 border-rose-200 text-sm text-rose-700 hover:bg-rose-50" disabled={busy === `cancel-${x.id}` || x.status === "cancelled"} onClick={() => void act(`cancel-${x.id}`, () => adminAPI.cancelBooking(x.id, d.reason || "Cancelled by admin"), "Booking cancelled.")}>Cancel booking</Button></div></div></div>; })}</div>
                </TabsContent>

                <TabsContent value="live" className="grid gap-3 xl:grid-cols-2">
                  {liveJobs.length ? liveJobs.map((x) => <div key={x.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-slate-500">Booking #{x.id}</p><h3 className="mt-1 text-xl font-semibold text-slate-950">{x.caregiver.name || "Unassigned caregiver"}</h3><p className="mt-1 text-sm text-slate-600">{x.patient.name || "Patient"} / {x.service_type || "General care"}</p></div><Status value={x.status} /></div><div className="mt-4 grid gap-2 md:grid-cols-3"><Cell l="Status" v={x.status.replaceAll("_", " ")} /><Cell l="Scheduled" v={when(x.start_time)} /><Cell l="Location" v={x.live_location ? `${x.live_location.lat.toFixed(4)}, ${x.live_location.lng.toFixed(4)}` : "Waiting for live ping"} /></div></div>) : <Empty icon={MapPin} title="No live jobs" body="Assigned and in-progress visits will appear here with their latest location." />}
                </TabsContent>

                <TabsContent value="payments" className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                  <Panel title="Earnings by caregiver" subtitle="Payout distribution"><div className="space-y-2.5">{earnings.length ? earnings.slice(0, 8).map((x, i) => <div key={`${x.caregiver_name}-${i}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div><p className="text-sm font-semibold text-slate-950">{x.caregiver_name || "Unknown caregiver"}</p><p className="text-xs text-slate-500">{x.email || "No email"}</p></div><p className="text-sm font-semibold text-slate-950">{money(x.earnings)}</p></div>) : <p className="text-sm text-slate-500">No paid caregiver transactions yet.</p>}</div></Panel>
                  <Panel title="Transaction feed" subtitle="Gross amount, caregiver payout, and platform fee"><div className="space-y-2.5">{transactions.length ? transactions.map((x) => <div key={x.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">Booking #{x.booking_id}</p><p className="text-sm text-slate-600">Caregiver {money(x.caregiver_amount)} / Platform {money(x.platform_fee)}</p></div><Status value={x.status === "paid" ? "arrived" : "on_the_way"} label={x.status} /></div></div>) : <Empty icon={DollarSign} title="No payment records" body="Transactions will appear here once bookings are marked paid." />}</div></Panel>
                </TabsContent>

                <TabsContent value="caregivers" className="grid gap-3 xl:grid-cols-2">
                  {caregivers.map((x) => <div key={x.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]"><div className="flex flex-wrap items-center gap-3"><h3 className="text-xl font-semibold text-slate-950">{x.full_name || "Unnamed caregiver"}</h3><span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${tone[x.status]}`}>{x.status}</span>{x.forced_offline ? <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">Forced offline</span> : null}</div><div className="mt-3 grid gap-2 md:grid-cols-2"><Cell l="Email" v={x.email || "No email"} /><Cell l="Location" v={x.location || "No location"} /><Cell l="Gender" v={x.gender || "Not provided"} /><Cell l="Availability" v={x.is_available ? "Online" : "Offline"} /><Cell l="Coordinates" v={x.latitude !== undefined && x.latitude !== null && x.longitude !== undefined && x.longitude !== null ? `${x.latitude.toFixed(4)}, ${x.longitude.toFixed(4)}` : "Not shared"} /><Cell l="Jobs completed" v={String(x.stats?.jobs_completed ?? 0)} /><Cell l="Average rating" v={`${x.stats?.average_rating ?? x.rating ?? 0} / 5`} /></div><div className="mt-4 flex flex-wrap gap-2"><Button className="h-10 text-sm" disabled={busy === `enable-${x.id}` || x.is_enabled} onClick={() => void act(`enable-${x.id}`, () => adminAPI.enableCaregiver(x.id), "Caregiver enabled.")}>Enable</Button><Button variant="outline" className="h-10 text-sm" disabled={busy === `disable-${x.id}` || !x.is_enabled} onClick={() => void act(`disable-${x.id}`, () => adminAPI.disableCaregiver(x.id), "Caregiver disabled.")}>Disable</Button><Button variant="outline" className="h-10 border-rose-200 text-sm text-rose-700 hover:bg-rose-50" disabled={busy === `force-${x.id}` || Boolean(x.forced_offline)} onClick={() => void act(`force-${x.id}`, () => adminAPI.forceOfflineCaregiver(x.id), "Caregiver forced offline.")}>Force offline</Button></div></div>)}
                </TabsContent>

                <TabsContent value="trust" className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <Panel title="Ratings and reviews" subtitle="Feedback that protects service quality"><div className="space-y-2.5">{reviews.length ? reviews.map((x) => <div key={x.id} className={`rounded-xl border px-4 py-4 ${x.rating <= 2 ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-950">{x.caregiver_name || "Caregiver"} / Booking #{x.booking_id}</p><p className="text-xs uppercase tracking-[0.18em] text-slate-500">From {x.patient_name || "Patient"}</p></div><div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800"><Star className="h-4 w-4 fill-current" />{x.rating}/5</div></div><p className="mt-3 text-sm leading-6 text-slate-700">{x.comment || "No written feedback provided."}</p></div>) : <Empty icon={Star} title="No reviews yet" body="Patient feedback will appear here once completed visits are reviewed." />}</div></Panel>
                  <div className="space-y-6">
                    <Panel title="Trust radar" subtitle="Quick quality read" dark><div className="grid gap-3"><Signal label="Low-rated reviews" value={String(reviews.filter((x) => x.rating <= 2).length)} /><Signal label="Five-star reviews" value={String(reviews.filter((x) => x.rating === 5).length)} /><Signal label="Rejected caregivers" value={String(approvalCounts.rejected)} /></div></Panel>
                    <Panel title="Face review" subtitle="Failed or overridden arrival face checks">
                      <div className="space-y-3">
                        {failedFaceBookings.length ? failedFaceBookings.map((booking) => {
                          const review = faceReviews[booking.id];
                          return (
                            <div key={booking.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-950">Booking #{booking.id}</p>
                                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{booking.caregiver.name || "Caregiver"} / {booking.patient.name || "Patient"}</p>
                                </div>
                                <Status value={booking.face_verification_status || "failed"} label={booking.face_verification_status || "failed"} />
                              </div>
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <Cell l="OTP" v={booking.otp_verified ? "Verified" : "Pending"} />
                                <Cell l="Face" v={(booking.face_verification_status || "pending").replaceAll("_", " ")} />
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button className="h-10 text-sm" variant="outline" disabled={busy === `face-review-${booking.id}`} onClick={() => void loadFaceReview(booking.id)}>
                                  {busy === `face-review-${booking.id}` ? "Loading..." : "Load face review"}
                                </Button>
                                <Button className="h-10 text-sm" disabled={busy === `override-${booking.id}` || booking.face_verification_status === "manual_override"} onClick={() => void act(`override-${booking.id}`, () => adminAPI.approveFaceOverride(booking.id), "Manual override approved.")}>
                                  Approve manual override
                                </Button>
                              </div>
                              {review ? (
                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Profile photo</p>
                                    {review.profile_photo_document_id ? <img src={getCaregiverDocumentUrl(review.profile_photo_document_id)} alt={`Booking ${booking.id} profile`} className="mt-3 h-48 w-full rounded-lg object-cover" /> : <p className="mt-3 text-sm text-slate-500">Profile photo unavailable.</p>}
                                  </div>
                                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Arrival selfie</p>
                                    {review.arrival_selfie_document_id ? <img src={getCaregiverDocumentUrl(review.arrival_selfie_document_id)} alt={`Booking ${booking.id} selfie`} className="mt-3 h-48 w-full rounded-lg object-cover" /> : <p className="mt-3 text-sm text-slate-500">Arrival selfie unavailable.</p>}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        }) : <p className="text-sm text-slate-500">No face verification reviews are waiting right now.</p>}
                      </div>
                    </Panel>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Toolbar({ query, setQuery, filter, setFilter, items, placeholder }: { query: string; setQuery: (v: string) => void; filter: string; setFilter: (v: any) => void; items: string[]; placeholder: string }) {
  return <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-3.5"><div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className="h-10 rounded-xl border-slate-200 bg-white pl-10 text-sm" /></div><div className="flex flex-wrap gap-2">{items.map((x) => <button key={x} type="button" onClick={() => setFilter(x)} className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${filter === x ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}>{x === "all" ? "All" : x.replaceAll("_", " ")}</button>)}</div></div></div>;
}
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: string }) { return <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)]"><div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div>; }
function Panel({ title, subtitle, dark = false, children }: { title: string; subtitle: string; dark?: boolean; children: React.ReactNode }) { return <section className={`rounded-[24px] border p-4 shadow-[0_12px_34px_rgba(15,23,42,0.05)] ${dark ? "border-slate-900 bg-slate-950 text-white shadow-[0_18px_50px_rgba(15,23,42,0.14)]" : "border-slate-200 bg-white"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${dark ? "text-cyan-300" : "text-slate-500"}`}>{title}</p><h2 className={`mt-2 text-xl font-semibold tracking-[-0.03em] ${dark ? "text-white" : "text-slate-950"}`}>{subtitle}</h2><div className="mt-4">{children}</div></section>; }
function Signal({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-950">{value}</p></div>; }
function Status({ value, label }: { value: string; label?: string }) { return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${tone[value] ?? tone.completed}`}>{(label || value).replaceAll("_", " ")}</span>; }
function Cell({ l, v }: { l: string; v: string }) { return <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{l}</p><p className="mt-1.5 text-sm font-medium leading-5 text-slate-900">{v}</p></div>; }
function Empty({ icon: Icon, title, body }: { icon: typeof MapPin; title: string; body: string }) { return <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]"><Icon className="h-5 w-5 text-slate-500" /></div><p className="mt-4 text-base font-semibold text-slate-950">{title}</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{body}</p></div>; }
