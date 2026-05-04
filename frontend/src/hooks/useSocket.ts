import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { getWebSocketURL } from "@/lib/api";
import { toast } from "sonner";

export function useSocket(bookingId: string | null) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const heartbeatTimer = useRef<number | null>(null);
  const { setCaregiverLocation, setBookingStatus } = useStore();

  useEffect(() => {
    if (!bookingId) return;

    let isActive = true;

    const clearTimers = () => {
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (heartbeatTimer.current) {
        window.clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };

    const connect = () => {
      const url = getWebSocketURL(bookingId);
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        heartbeatTimer.current = window.setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send("ping");
          }
        }, 20000);
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") {
            return;
          }
          const hasLocation =
            (data.type === "location_update" || data.type === undefined || data.type === "status") &&
            typeof data.lat === "number" &&
            typeof data.lng === "number";

          if (hasLocation) {
            setCaregiverLocation({ lat: data.lat, lng: data.lng });
          } else if (data.status === "pending" || data.status === "cancelled") {
            setCaregiverLocation(null);
          }
          if (typeof data.status === "string") {
            setBookingStatus(data.status);
            const messages: Record<string, string> = {
              assigned: "Caregiver has been assigned",
              accepted: "Caregiver accepted the booking",
              on_the_way: "Caregiver is on the way",
              arrived: "Caregiver arrived",
              started: "Service started",
              completed: "Service completed",
              rejected: "Caregiver rejected the booking",
            };
            if (messages[data.status]) {
              toast.success(messages[data.status]);
            }
          }
        } catch (error) {
          console.error("WebSocket parse error", error);
        }
      };

      ws.current.onerror = () => {
        if (isActive) {
          toast.error("Tracking connection error");
        }
      };

      ws.current.onclose = () => {
        clearTimers();
        if (isActive) {
          reconnectTimer.current = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      isActive = false;
      clearTimers();
      setCaregiverLocation(null);
      ws.current?.close();
    };
  }, [bookingId, setCaregiverLocation, setBookingStatus]);

  return ws.current;
}
