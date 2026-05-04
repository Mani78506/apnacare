import { Component, Suspense, lazy, type ReactNode } from "react";
import { MapPin, ShieldCheck } from "lucide-react";

const LiveTrackingMap = lazy(() => import("@/components/LiveTrackingMap"));

interface Coordinates {
  lat: number;
  lng: number;
}

interface Props {
  caregiverLocation: Coordinates | null;
  userLocation: Coordinates | null;
  status?: string;
}

class TrackingMapErrorBoundary extends Component<
  Props & { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: Props & { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <TrackingMapFallback caregiverLocation={this.props.caregiverLocation} userLocation={this.props.userLocation} />;
    }

    return this.props.children;
  }
}

function formatCoordinates(location: Coordinates | null) {
  if (!location) {
    return "Waiting for coordinates";
  }

  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
}

function TrackingMapFallback({ caregiverLocation, userLocation }: Props) {
  return (
    <div className="flex h-[460px] items-center justify-center overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,rgba(7,18,32,0.96),rgba(3,10,20,0.98))] p-6 text-white lg:h-[440px]">
      <div className="max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_16px_50px_rgba(15,23,42,0.45)]">
          <MapPin className="h-6 w-6 text-cyan-300" />
        </div>
        <div>
          <p className="font-semibold text-white">Live map is temporarily unavailable</p>
          <p className="text-sm text-slate-300">
            Tracking data is still active below while the map experience reloads.
          </p>
        </div>
        <div className="grid gap-3 text-left md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_40px_rgba(15,23,42,0.25)]">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Your location</p>
            <p className="mt-2 font-medium text-white">{formatCoordinates(userLocation)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_40px_rgba(15,23,42,0.25)]">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Caregiver location</p>
            <p className="mt-2 font-medium text-white">{formatCoordinates(caregiverLocation)}</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          Live tracking feed remains connected
        </div>
      </div>
    </div>
  );
}

export default function TrackingMapPanel({ caregiverLocation, userLocation, status = "assigned" }: Props) {
  return (
    <TrackingMapErrorBoundary caregiverLocation={caregiverLocation} userLocation={userLocation}>
      <Suspense fallback={<TrackingMapFallback caregiverLocation={caregiverLocation} userLocation={userLocation} />}>
        <LiveTrackingMap caregiverLocation={caregiverLocation} userLocation={userLocation} status={status} />
      </Suspense>
    </TrackingMapErrorBoundary>
  );
}
