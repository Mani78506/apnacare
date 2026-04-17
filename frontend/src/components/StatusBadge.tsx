import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground" },
  assigned: { label: "Assigned", color: "bg-accent text-accent-foreground" },
  accepted: { label: "Accepted", color: "bg-cyan-100 text-cyan-800" },
  on_the_way: { label: "On the Way", color: "bg-warning text-warning-foreground" },
  arrived: { label: "Arrived", color: "bg-success text-success-foreground" },
  started: { label: "Started", color: "bg-violet-100 text-violet-800" },
  completed: { label: "Completed", color: "bg-secondary text-secondary-foreground" },
  rejected: { label: "Rejected", color: "bg-rose-100 text-rose-700" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium", config.color)}>
      <span className="h-2 w-2 rounded-full bg-current animate-pulse-dot" />
      {config.label}
    </span>
  );
}
