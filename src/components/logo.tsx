import { cn } from "@/lib/cn";

/** Logo générique (losange violet de la maquette). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-brand-logo/90",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none">
        <path d="M12 2 22 12 12 22 2 12Z" fill="white" fillOpacity={0.35} />
        <path d="M12 7 17 12 12 17 7 12Z" fill="white" />
      </svg>
    </span>
  );
}
