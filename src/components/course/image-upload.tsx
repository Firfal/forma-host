"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/firebase/callables";
import { uploadPublicFile, validateImage } from "@/lib/storage";

/** Sélection + téléversement d'une image publique (miniature). */
export function ImageUpload({
  value,
  onChange,
  pathFor,
  label = "Choisir une image",
  hint = "PNG, JPEG, GIF ou WEBP, 5 Mo max. Format 16:9 conseillé (1280 × 720).",
  maxMb = 5,
  previewClassName = "aspect-video w-full max-w-sm",
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  pathFor: (fileName: string) => string;
  label?: string;
  hint?: string;
  maxMb?: number;
  /** Taille de l'aperçu (16:9 par défaut ; carré pour un logo). */
  previewClassName?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = validateImage(file, maxMb);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(true);
    try {
      onChange(await uploadPublicFile(pathFor, file));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {value ? (
        <div
          className={cn(
            "relative overflow-hidden rounded-md border border-line bg-surface",
            previewClassName,
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-ink shadow hover:bg-white"
            aria-label="Retirer l'image"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {uploading ? "Envoi…" : value ? "Remplacer" : label}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={onFile}
        />
      </div>
      <p className="text-[12px] text-muted">{hint}</p>
    </div>
  );
}
