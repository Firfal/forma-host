import { PlaySquare } from "lucide-react";
import { cn } from "@/lib/cn";

/** Miniature 16:9, ou un aplat violet (comme la maquette) si aucune image. */
export function CourseThumbnail({
  src,
  title,
  className,
}: {
  src: string | null | undefined;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video overflow-hidden bg-gradient-to-br from-brand-soft via-[#e6d9fb] to-brand-logo/40",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex size-12 items-center justify-center rounded-xl bg-white/60 text-brand shadow-sm">
            <PlaySquare className="size-6" />
          </span>
        </div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}
