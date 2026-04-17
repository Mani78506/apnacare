import { Loader2 } from "lucide-react";

export default function Loader({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
      <p className="text-muted-foreground text-sm">{text}</p>
    </div>
  );
}
