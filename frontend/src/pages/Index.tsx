import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseMedical,
  Building2,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserPlus2,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_TOKEN_KEY, CAREGIVER_TOKEN_KEY, getStoredSharedRole, SHARED_TOKEN_KEY } from "@/lib/session";

const portals = [
  {
    title: "Patient Portal",
    subtitle: "For families and patients",
    description: "Book a caregiver, manage requests, and track home-care visits without switching between apps.",
    href: "/login",
    cta: "Enter patient portal",
    icon: HeartPulse,
    accent: "from-cyan-400 to-blue-500",
    surface: "from-cyan-500/[0.16] via-white to-cyan-50",
    stats: "Booking, tracking, support",
  },
  {
    title: "Caregiver Hub",
    subtitle: "For active field teams",
    description: "Accept assigned jobs, share live location, and move each visit through route and service milestones.",
    href: "/caregiver/login",
    cta: "Open caregiver hub",
    icon: BriefcaseMedical,
    accent: "from-emerald-400 to-teal-500",
    surface: "from-emerald-500/[0.18] via-white to-emerald-50",
    stats: "Dispatch, status, live ops",
  },
  {
    title: "Create Account",
    subtitle: "For families or caregivers",
    description: "Start with one signup flow, then choose whether you are booking care or joining as a caregiver.",
    href: "/signup",
    cta: "Create new account",
    icon: UserPlus2,
    accent: "from-fuchsia-400 to-violet-500",
    surface: "from-fuchsia-500/[0.16] via-white to-fuchsia-50",
    stats: "Role select, onboarding, access",
  },
];

const adminPortal = {
  title: "Staff/Admin Access",
  subtitle: "Restricted staff access",
  href: "/admin/login",
  icon: Building2,
};

const operations = [
  "Clear role-based access for every user",
  "Separate patient, caregiver, and admin sessions",
  "One branded gateway instead of scattered logins",
];

export default function IndexPage() {
  const sharedRole = getStoredSharedRole();
  const hasUserSession = Boolean(localStorage.getItem(SHARED_TOKEN_KEY));
  const hasAdminSession = Boolean(localStorage.getItem(ADMIN_TOKEN_KEY));
  const hasCaregiverSession = Boolean(localStorage.getItem(CAREGIVER_TOKEN_KEY));
  const hasPatientSession = hasUserSession && sharedRole === "user";
  const AdminIcon = adminPortal.icon;

  return (
    <main className="portal-stage portal-landing min-h-screen overflow-x-hidden px-2 py-2 text-slate-950 md:px-3 md:py-3">
      <div className="mx-auto max-w-[1240px]">
        <section className="portal-landing__shell relative overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-4 shadow-[0_26px_100px_rgba(15,23,42,0.10)] backdrop-blur-xl md:p-5 lg:p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.14),_transparent_28%)]" />
          <div className="relative">
            <header className="flex flex-col gap-3 border-b border-slate-200/70 pb-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-slate-950 text-white shadow-lg">
                  <Stethoscope className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-[0.82rem] font-semibold uppercase tracking-[0.26em] text-cyan-700">ApnaCare</p>
                  <p className="text-[0.9rem] text-slate-500">Unified healthcare operations access</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3.5 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-cyan-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Portal Selection
                </div>
                {hasPatientSession && (
                  <Button asChild className="h-10 rounded-full px-4 shadow-lg">
                    <Link to="/home">
                      Continue patient session
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
                {hasAdminSession && (
                  <Button asChild className="h-10 rounded-full bg-slate-950 px-4 text-white shadow-lg hover:bg-slate-800">
                    <Link to="/admin/dashboard">
                      Continue admin session
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
                {hasCaregiverSession && (
                  <Button asChild variant="secondary" className="h-10 rounded-full px-4 shadow-lg">
                    <Link to="/caregiver/dashboard">
                      Continue caregiver session
                      <ArrowRight />
                    </Link>
                  </Button>
                )}
              </div>
            </header>

            <div className="portal-landing__layout mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
              <div className="portal-landing__copy space-y-3.5">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3.5 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-700 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  One front door, multiple workflows
                </div>

                <div className="max-w-3xl">
                  <h1 className="portal-landing__headline max-w-[700px] font-serif text-[2.55rem] leading-[0.95] tracking-[-0.05em] text-slate-950 md:text-[3.7rem]">
                    One place for families to book care and caregivers to deliver it with confidence.
                  </h1>
                  <p className="portal-landing__intro mt-3 max-w-[34rem] text-[0.96rem] leading-6 text-slate-600 md:text-[1rem]">
                    ApnaCare brings booking, live tracking, caregiver operations, and onboarding into a single
                    healthcare platform with clear access for every role.
                  </p>
                </div>

                <div className="portal-landing__support grid gap-3 md:grid-cols-[1.04fr_0.96fr]">
                  <div className="rounded-[22px] border border-slate-200/80 bg-slate-950 p-3.5 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-white/10 text-cyan-300">
                        <Waves className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-[0.82rem] uppercase tracking-[0.22em] text-cyan-300">Experience</p>
                        <p className="text-[0.88rem] text-slate-300">Role-specific access without confusion</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                      <Metric label="Verified caregivers" value="100%" />
                      <Metric label="Location sync" value="5 sec" />
                      <Metric label="Care support" value="24/7" />
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3.5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                    <p className="text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Why this works</p>
                    <div className="mt-3 space-y-2.5">
                      {operations.map((item, index) => (
                        <div key={item} className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-slate-950 text-[0.7rem] font-semibold text-white">
                            {index + 1}
                          </div>
                          <p className="text-[0.92rem] leading-5 text-slate-600">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="portal-landing__right flex w-full max-w-[560px] flex-col gap-3 justify-self-end">
                <div className="flex justify-end">
                  <Link
                    to={adminPortal.href}
                    className="group inline-flex items-center gap-2.5 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition hover:border-slate-300 hover:bg-white hover:text-slate-950"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fde68a,#67e8f9)] text-slate-950 shadow-sm">
                      <AdminIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500">{adminPortal.subtitle}</p>
                      <p className="text-[0.9rem] font-semibold leading-none text-inherit">{adminPortal.title}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-950" />
                  </Link>
                </div>

                <aside className="portal-landing__board w-full rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,#09111f_0%,#111827_100%)] p-4 text-white shadow-[0_28px_100px_rgba(15,23,42,0.24)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.82rem] uppercase tracking-[0.22em] text-cyan-300">Portal board</p>
                      <h2 className="mt-1.5 text-[1.65rem] font-semibold leading-none">Choose your workspace</h2>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.68rem] uppercase tracking-[0.2em] text-slate-300">
                      Live
                    </div>
                  </div>

                  <div className="portal-landing__cards mt-3 space-y-2.5">
                    {portals.map((portal) => {
                      const Icon = portal.icon;
                      return (
                        <Link
                          key={portal.title}
                          to={portal.href}
                          className="portal-landing__card group block rounded-[22px] border border-white/10 bg-white/[0.04] p-[0.95rem] transition duration-300 hover:border-white/20 hover:bg-white/[0.08]"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${portal.accent} text-slate-950 shadow-lg`}>
                              <Icon className="h-4.5 w-4.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2.5">
                                <div>
                                  <p className="text-[0.74rem] uppercase tracking-[0.2em] text-slate-400">{portal.subtitle}</p>
                                  <h3 className="mt-1 text-[1.3rem] font-semibold leading-none text-white">{portal.title}</h3>
                                </div>
                                <ArrowRight className="mt-1 h-4 w-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-white" />
                              </div>
                              <p className="mt-1.5 text-[0.92rem] leading-[1.4] text-slate-300">{portal.description}</p>
                              <div className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-slate-300">
                                {portal.stats}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-2.5">
      <p className="text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-[1.7rem] font-semibold leading-none text-white">{value}</p>
    </div>
  );
}
