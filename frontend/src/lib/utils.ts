import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLabel(value?: string | null) {
  if (!value) return "";

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatDurationPlan(durationType?: string | null, hours?: number | null, days?: number | null, months?: number | null) {
  if (durationType === "hourly" && hours) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (durationType === "daily" && days) return `${days} day${days > 1 ? "s" : ""}`;
  if (durationType === "monthly" && months) return `${months} month${months > 1 ? "s" : ""}`;
  return "Not set";
}

export function getDurationProgress({
  durationType,
  hours,
  days,
  months,
  startTime,
  endTime,
}: {
  durationType?: string | null;
  hours?: number | null;
  days?: number | null;
  months?: number | null;
  startTime?: string | null;
  endTime?: string | null;
}) {
  const totalUnits =
    durationType === "hourly" ? (hours ?? 0) :
    durationType === "daily" ? (days ?? 0) :
    durationType === "monthly" ? (months ?? 0) :
    0;

  const unitLabel =
    durationType === "hourly" ? "hours" :
    durationType === "daily" ? "days" :
    durationType === "monthly" ? "months" :
    "units";

  if (!totalUnits || !startTime || !endTime) {
    return { total: totalUnits, completed: 0, left: totalUnits, unitLabel };
  }

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const nowMs = Date.now();
  const totalMs = Math.max(endMs - startMs, 1);
  const elapsedMs = Math.min(Math.max(nowMs - startMs, 0), totalMs);
  const completed = Math.min(totalUnits, Math.floor((elapsedMs / totalMs) * totalUnits));
  const left = Math.max(totalUnits - completed, 0);

  return { total: totalUnits, completed, left, unitLabel };
}
