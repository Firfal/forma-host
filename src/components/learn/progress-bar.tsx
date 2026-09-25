import { cn } from "@/lib/cn";

export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line-soft", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className="h-full rounded-full bg-brand-logo transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function progressLabel(done: number, total: number): string {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return `${done} sur ${total} terminé${done > 1 ? "s" : ""} (${percent} %)`;
}
