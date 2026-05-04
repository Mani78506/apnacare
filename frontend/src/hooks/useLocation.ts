import { useEffect, useRef, useState } from "react";
import { caregiverAPI } from "@/lib/api";
import { useCaregiverStore } from "@/store/useCaregiverStore";

interface UseLocationOptions {
  caregiverId: number | null;
  bookingId: number | null;
  enabled: boolean;
}

export function useLocation({ caregiverId, bookingId, enabled }: UseLocationOptions) {
  const { setLiveLocation } = useCaregiverStore();
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !caregiverId || !bookingId) {
      setIsSharing(false);
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setIsSharing(false);
      setPermissionError("Location permission denied. Please enable GPS/location access.");
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setPermissionError(null);
        setLiveLocation(coords);
        setIsSharing(true);

        try {
          await caregiverAPI.updateLocation({
            caregiver_id: caregiverId,
            booking_id: bookingId,
            lat: coords.lat,
            lng: coords.lng,
          });
        } catch (error: any) {
          setIsSharing(false);
          setPermissionError(error.response?.data?.detail || "Unable to sync caregiver location.");
        }
      },
      () => {
        setIsSharing(false);
        setPermissionError("Location permission denied. Please enable GPS/location access.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [bookingId, caregiverId, enabled, setLiveLocation]);

  return { permissionError, isSharing };
}
