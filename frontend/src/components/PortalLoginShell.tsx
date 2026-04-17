import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface FeatureCard {
  icon: LucideIcon;
  eyebrow: string;
  description: string;
  tone?: "dark" | "light";
}

interface PortalLink {
  href: string;
  eyebrow: string;
  label: string;
}

interface PortalLoginShellProps {
  portalLabel: string;
  portalBadgeIcon: LucideIcon;
  heroIcon: LucideIcon;
  heroTitle: string;
  heroDescription: string;
  formIcon: LucideIcon;
  formTitle: string;
  formDescription: string;
  features: FeatureCard[];
  portalLinks?: PortalLink[];
  children: ReactNode;
  footer?: ReactNode;
  compactDesktop?: boolean;
}

export default function PortalLoginShell({
  portalLabel,
  portalBadgeIcon: PortalBadgeIcon,
  heroIcon: HeroIcon,
  heroTitle,
  heroDescription,
  formIcon: FormIcon,
  formTitle,
  formDescription,
  features,
  portalLinks = [],
  children,
  footer,
  compactDesktop = false,
}: PortalLoginShellProps) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(180deg,_#f6fbff_0%,_#f9fcff_100%)] px-4 py-6 lg:h-dvh lg:overflow-hidden lg:py-4">
      <div className="mx-auto grid max-w-6xl gap-6 lg:h-full lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
        <section className="rounded-[32px] border border-white/70 bg-white/80 p-8 shadow-[0_28px_100px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:p-5 xl:p-6">
          <Link to="/" className="inline-flex w-fit self-start items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:text-slate-950">
            Back to portal selection
          </Link>
          <div className={`mt-8 lg:mt-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col ${compactDesktop ? "lg:justify-start" : "lg:justify-between"}`}>
            <div className="max-w-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg lg:h-11 lg:w-11">
                <HeroIcon className="h-5 w-5 lg:h-4.5 lg:w-4.5" />
              </div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-700 lg:mt-4 lg:px-3.5 lg:py-1.5 lg:text-[0.68rem] lg:tracking-[0.24em]">
                <PortalBadgeIcon className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                {portalLabel}
              </div>
              <h1
                className={`mt-5 font-serif text-5xl leading-[0.95] tracking-[-0.05em] text-slate-950 md:text-6xl lg:mt-4 ${
                  compactDesktop ? "lg:text-[clamp(2.8rem,3.5vw,4rem)] lg:leading-[0.92]" : "lg:text-[clamp(3.25rem,4.2vw,4.85rem)]"
                }`}
              >
                {heroTitle}
              </h1>
              <p
                className={`mt-5 text-lg leading-8 text-slate-600 lg:mt-4 ${
                  compactDesktop ? "lg:text-[0.96rem] lg:leading-6" : "lg:text-[1.02rem] lg:leading-7"
                }`}
              >
                {heroDescription}
              </p>
            </div>

            <div className={`mt-8 space-y-4 lg:mt-5 ${compactDesktop ? "lg:space-y-2.5" : "lg:space-y-3"}`}>
              <div className={`grid gap-4 sm:grid-cols-2 ${compactDesktop ? "lg:gap-2.5" : "lg:gap-3"}`}>
                {features.map((feature) => {
                  const Icon = feature.icon;
                  const isDark = feature.tone === "dark";

                  return (
                    <div
                      key={feature.eyebrow}
                      className={`rounded-[24px] border p-5 lg:rounded-[22px] ${compactDesktop ? "lg:p-3.5" : "lg:p-4"} ${isDark ? "border-slate-200 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950"}`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl lg:h-10 lg:w-10 lg:rounded-[18px] ${isDark ? "bg-white/10 text-cyan-300" : "bg-cyan-50 text-cyan-700"}`}>
                        <Icon className="h-5 w-5 lg:h-4.5 lg:w-4.5" />
                      </div>
                      <p className={`mt-4 text-sm uppercase tracking-[0.24em] lg:mt-3 lg:text-[0.78rem] lg:tracking-[0.22em] ${isDark ? "text-cyan-300" : "text-slate-500"}`}>{feature.eyebrow}</p>
                      <p className={`mt-2 text-sm ${compactDesktop ? "leading-6 lg:text-[0.96rem] lg:leading-[1.55]" : "leading-7 lg:leading-6"} ${isDark ? "text-slate-300" : "text-slate-600"}`}>{feature.description}</p>
                    </div>
                  );
                })}
              </div>
              {portalLinks.length ? (
                <div className={`grid gap-3 sm:grid-cols-2 ${compactDesktop ? "lg:gap-2.5" : ""}`}>
                  {portalLinks.map((portalLink) => (
                    <Link
                      key={portalLink.href}
                      to={portalLink.href}
                      className={`group border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm ${
                        compactDesktop
                          ? "rounded-[18px] px-4 py-3 lg:px-3.5 lg:py-2.5"
                          : "rounded-[24px] px-5 py-4 lg:rounded-[22px] lg:px-4 lg:py-3.5"
                      }`}
                    >
                      <p className={`font-semibold uppercase text-slate-500 ${compactDesktop ? "text-[0.64rem] tracking-[0.2em]" : "text-xs tracking-[0.24em] lg:text-[0.68rem] lg:tracking-[0.22em]"}`}>{portalLink.eyebrow}</p>
                      <div className={`flex items-center justify-between font-medium text-slate-900 ${compactDesktop ? "mt-1.5 text-[0.92rem]" : "mt-2 text-sm"}`}>
                        {portalLink.label}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <Card className="w-full rounded-[32px] border-white/70 bg-white/90 shadow-[0_30px_110px_rgba(15,23,42,0.10)] lg:flex lg:h-full lg:min-h-0 lg:flex-col">
          <CardHeader className={`space-y-3 pt-8 lg:shrink-0 ${compactDesktop ? "lg:space-y-1.5 lg:pt-6" : "lg:space-y-2 lg:pt-7"}`}>
            <div className="flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg lg:h-11 lg:w-11">
                <FormIcon className="h-5 w-5 lg:h-4.5 lg:w-4.5" />
              </div>
            </div>
            <div className="text-center">
              <CardTitle className={`text-3xl ${compactDesktop ? "lg:text-[2.15rem]" : "lg:text-[2.35rem]"}`}>{formTitle}</CardTitle>
              <CardDescription className="mt-2">{formDescription}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className={`pb-8 lg:flex lg:flex-1 lg:flex-col lg:justify-start ${compactDesktop ? "lg:pb-6 lg:pt-2" : "lg:pb-7 lg:pt-1"}`}>
            {children}
            {footer ? footer : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
