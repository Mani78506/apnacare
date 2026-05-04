import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

type Coordinates = { lat: number; lng: number };

interface LiveTrackingMapProps {
  userLocation: Coordinates | null;
  caregiverLocation: Coordinates | null;
  status: string;
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];

const statusText: Record<string, string> = {
  assigned: "Caregiver Assigned",
  accepted: "Caregiver Accepted Booking",
  on_the_way: "Caregiver is on the way",
  arrived: "Caregiver has arrived",
  started: "Service Started",
  completed: "Service Completed",
};

const userIcon = new L.DivIcon({
  html: `<div class="marker-bubble user-marker__bubble">🏠</div>`,
  className: "user-marker",
  iconSize: [42, 42],
  iconAnchor: [21, 21],
  popupAnchor: [0, -22],
});

function createCaregiverIcon(status: string) {
  const isPulsing = status === "on_the_way" || status === "arrived";
  const isArrived = status === "arrived";

  return new L.DivIcon({
    html: `<div class="marker-bubble caregiver-marker__bubble ${isArrived ? "caregiver-marker__bubble--arrived" : ""}">🚗</div>`,
    className: `caregiver-marker${isPulsing ? " pulse-marker" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
  });
}

export function getStraightLineDistanceKm(start: Coordinates, end: Coordinates) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(end.lat - start.lat);
  const dLng = toRadians(end.lng - start.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(start.lat)) * Math.cos(toRadians(end.lat)) * Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function MapController({
  userLocation,
  caregiverLocation,
}: {
  userLocation: Coordinates | null;
  caregiverLocation: Coordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (userLocation && caregiverLocation) {
      map.fitBounds(
        L.latLngBounds(
          [userLocation.lat, userLocation.lng],
          [caregiverLocation.lat, caregiverLocation.lng],
        ),
        { padding: [68, 68], maxZoom: 15 },
      );
      return;
    }

    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 14);
      return;
    }

    if (caregiverLocation) {
      map.setView([caregiverLocation.lat, caregiverLocation.lng], 14);
    }
  }, [caregiverLocation, map, userLocation]);

  return null;
}

function SmoothMarker({
  location,
  icon,
  children,
}: {
  location: Coordinates;
  icon: L.Icon;
  children: ReactNode;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const position = useMemo<[number, number]>(() => [location.lat, location.lng], [location.lat, location.lng]);

  useEffect(() => {
    markerRef.current?.setLatLng(position);
  }, [position]);

  return (
    <Marker ref={markerRef} position={position} icon={icon}>
      {children}
    </Marker>
  );
}

export default function LiveTrackingMap({ userLocation, caregiverLocation, status }: LiveTrackingMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (userLocation) return [userLocation.lat, userLocation.lng];
    if (caregiverLocation) return [caregiverLocation.lat, caregiverLocation.lng];
    return DEFAULT_CENTER;
  }, [caregiverLocation, userLocation]);

  const patientPosition = userLocation ? ([userLocation.lat, userLocation.lng] as [number, number]) : null;
  const caregiverPosition = caregiverLocation ? ([caregiverLocation.lat, caregiverLocation.lng] as [number, number]) : null;
  const distanceKm =
    userLocation && caregiverLocation ? getStraightLineDistanceKm(userLocation, caregiverLocation) : null;
  const normalizedStatus = status || "assigned";
  const caregiverIcon = useMemo(() => createCaregiverIcon(normalizedStatus), [normalizedStatus]);
  const isCompleted = normalizedStatus === "completed";
  const isStarted = normalizedStatus === "started";
  const isArrived = normalizedStatus === "arrived";
  const routeColor = isCompleted ? "#64748b" : isArrived ? "#16a34a" : "#0891b2";
  const routeDashArray = isCompleted ? "8 10" : normalizedStatus === "on_the_way" ? "12 10" : undefined;

  if (!userLocation && !caregiverLocation) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-[22px] border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
        Waiting for location...
      </div>
    );
  }

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[22px] border border-slate-200 bg-slate-50">
      <style>{`
        .user-marker,
        .caregiver-marker {
          background: transparent;
          border: 0;
        }

        .marker-bubble {
          align-items: center;
          border: 3px solid #ffffff;
          border-radius: 9999px;
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
          display: flex;
          font-size: 22px;
          height: 42px;
          justify-content: center;
          line-height: 1;
          transition: background-color 240ms ease, box-shadow 240ms ease, transform 700ms linear;
          width: 42px;
        }

        .user-marker__bubble {
          background: #0f766e;
        }

        .caregiver-marker__bubble {
          background: #0284c7;
        }

        .caregiver-marker__bubble--arrived {
          background: #16a34a;
        }

        .pulse-marker .marker-bubble {
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <MapContainer center={center} zoom={14} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController userLocation={userLocation} caregiverLocation={caregiverLocation} />

        {patientPosition ? (
          <Marker position={patientPosition} icon={userIcon}>
            <Popup>You / Patient Location</Popup>
            {isArrived ? (
              <Tooltip permanent direction="top" offset={[0, -24]} className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-800">
                Caregiver has arrived
              </Tooltip>
            ) : null}
          </Marker>
        ) : null}

        {patientPosition && isStarted ? (
          <Circle
            center={patientPosition}
            radius={180}
            pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed", fillOpacity: 0.12, opacity: 0.75, weight: 2 }}
          />
        ) : null}

        {caregiverLocation && caregiverPosition ? (
          <SmoothMarker location={caregiverLocation} icon={caregiverIcon}>
            <Popup>Caregiver</Popup>
          </SmoothMarker>
        ) : null}

        {patientPosition && caregiverPosition ? (
          <Polyline
            positions={[caregiverPosition, patientPosition]}
            pathOptions={{ color: routeColor, weight: 4, opacity: isCompleted ? 0.65 : 0.9, dashArray: routeDashArray }}
          />
        ) : null}
      </MapContainer>

      <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
        <div>{statusText[normalizedStatus] ?? normalizedStatus.replaceAll("_", " ")}</div>
        <div className="mt-1 text-xs font-medium text-slate-600">
          Distance remaining: {distanceKm == null ? "Waiting for both locations" : `${distanceKm.toFixed(distanceKm > 10 ? 1 : 2)} km`}
        </div>
      </div>

      {!caregiverLocation ? (
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-semibold text-amber-800 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
          Waiting for caregiver live location...
        </div>
      ) : null}

      {!userLocation ? (
        <div className="absolute bottom-4 left-4 right-4 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-semibold text-amber-800 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
          Patient location not available
        </div>
      ) : null}

      {isStarted ? (
        <div className="absolute right-4 top-4 rounded-full border border-violet-200 bg-violet-50/95 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-800 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
          Active Service
        </div>
      ) : null}

      {isCompleted ? (
        <div className="absolute right-4 top-4 rounded-full border border-slate-200 bg-slate-50/95 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur">
          Completed
        </div>
      ) : null}
      </div>
  );
}
