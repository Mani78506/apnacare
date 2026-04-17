import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Radio } from "lucide-react";

interface Props {
  caregiverLocation: { lat: number; lng: number } | null;
  userLocation?: { lat: number; lng: number };
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];

const patientIcon = new L.DivIcon({
  html: `
    <div class="tracker-marker tracker-marker--patient">
      <span class="tracker-marker__halo"></span>
      <span class="tracker-marker__dot"></span>
    </div>
  `,
  className: "",
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const caregiverIcon = new L.DivIcon({
  html: `
    <div class="tracker-marker tracker-marker--caregiver">
      <span class="tracker-marker__halo"></span>
      <span class="tracker-marker__dot"></span>
    </div>
  `,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function MapViewportController({
  patientPosition,
  caregiverPosition,
}: {
  patientPosition: [number, number];
  caregiverPosition: [number, number] | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (caregiverPosition) {
      const bounds = L.latLngBounds([patientPosition, caregiverPosition]);
      map.flyToBounds(bounds, {
        padding: [72, 72],
        duration: 1.4,
        maxZoom: 14,
      });
      return;
    }

    map.flyTo(patientPosition, 13, {
      duration: 1.2,
    });
  }, [caregiverPosition, map, patientPosition]);

  return null;
}

export default function TrackingMap({ caregiverLocation, userLocation }: Props) {
  const patientPosition = useMemo<[number, number]>(
    () => (userLocation ? [userLocation.lat, userLocation.lng] : DEFAULT_CENTER),
    [userLocation]
  );

  const caregiverPosition = caregiverLocation
    ? ([caregiverLocation.lat, caregiverLocation.lng] as [number, number])
    : null;

  const routePositions = caregiverPosition ? [patientPosition, caregiverPosition] : [patientPosition];

  return (
    <div className="relative h-[460px] overflow-hidden rounded-[32px] border border-white/10 shadow-[0_28px_90px_rgba(2,12,27,0.42)] lg:h-[440px]">
      <MapContainer
        center={patientPosition}
        zoom={13}
        zoomControl={false}
        className="h-full w-full bg-slate-950"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapViewportController patientPosition={patientPosition} caregiverPosition={caregiverPosition} />

        <Circle
          center={patientPosition}
          radius={140}
          pathOptions={{
            color: "#34d399",
            opacity: 0.25,
            fillColor: "#34d399",
            fillOpacity: 0.14,
            weight: 1.5,
          }}
        />
        <Marker position={patientPosition} icon={patientIcon} />

        {caregiverPosition && (
          <>
            <Circle
              center={caregiverPosition}
              radius={180}
              pathOptions={{
                color: "#38bdf8",
                opacity: 0.28,
                fillColor: "#38bdf8",
                fillOpacity: 0.14,
                weight: 1.5,
              }}
            />
            <Polyline
              positions={routePositions}
              pathOptions={{
                color: "#38bdf8",
                weight: 5,
                opacity: 0.82,
                dashArray: "14 14",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Marker position={caregiverPosition} icon={caregiverIcon} />
          </>
        )}
      </MapContainer>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.18),transparent_24%),linear-gradient(180deg,rgba(2,12,27,0.02),rgba(2,12,27,0.18))]" />

      <div className="pointer-events-none absolute inset-x-5 top-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200 backdrop-blur-md">
          <Radio className="h-4 w-4 animate-pulse" />
          Leaflet live route
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-medium text-slate-100 backdrop-blur-md">
          <MapPin className="h-4 w-4 text-emerald-300" />
          {caregiverPosition ? "OpenStreetMap tracking active" : "Waiting for caregiver GPS"}
        </div>
      </div>

      {!caregiverPosition && (
        <div className="pointer-events-none absolute inset-x-5 bottom-5 rounded-[28px] border border-white/10 bg-slate-950/72 px-5 py-4 text-white shadow-[0_18px_50px_rgba(2,12,27,0.48)] backdrop-blur-md">
          <p className="text-sm font-semibold">Caregiver assigned</p>
          <p className="mt-1 text-sm text-slate-300">
            The live marker will appear here as soon as the caregiver starts sharing GPS updates.
          </p>
        </div>
      )}
    </div>
  );
}
