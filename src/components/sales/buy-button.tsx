"use client";

import { ArrowRight, Loader2, Lock } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { formatPrice, type CoursePrice } from "@shared/payments";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { callCreateCheckoutSession, errorMessage } from "@/lib/firebase/callables";

/**
 * Achat d'une formation : récapitulatif, acceptation des CGV et renonciation au droit de
 * rétractation (accès immédiat à un contenu numérique), puis page de paiement Stripe de l'école.
 */
export function BuyButton({
  courseId,
  courseTitle,
  price,
  label,
  className,
  brandColor,
  termsUrl,
}: {
  courseId: string;
  courseTitle: string;
  price: CoursePrice;
  label: string;
  className?: string;
  brandColor: string;
  /** CGV de l'école (null : pas encore publiées). */
  termsUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      const { url } = await callCreateCheckoutSession({ courseId, acceptTerms: true });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          {label} <ArrowRight className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent
        title="Ta commande"
        style={{ "--brand": brandColor } as CSSProperties}
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-md border border-line px-3 py-3">
            <div>
              <p className="text-sm font-medium">{courseTitle}</p>
              <p className="text-[12px] text-muted">Formation en ligne, accès immédiat</p>
            </div>
            <p className="shrink-0 text-base font-semibold">{formatPrice(price.amount)}</p>
          </div>

          <label className="flex cursor-pointer gap-2.5 text-[13px] leading-5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]"
            />
            <span>
              {termsUrl ? (
                <>
                  J&apos;accepte les{" "}
                  <a
                    href={termsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline"
                  >
                    conditions générales de vente
                  </a>
                  . Je
                </>
              ) : (
                "Je"
              )}{" "}
              demande l&apos;accès immédiat à la formation et renonce ainsi à mon droit de
              rétractation.
            </span>
          </label>

          <button
            type="button"
            onClick={pay}
            disabled={!accepted || busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Redirection vers le paiement…
              </>
            ) : (
              <>
                Continuer vers le paiement <ArrowRight className="size-4" />
              </>
            )}
          </button>
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
            <Lock className="size-3.5" /> Paiement sécurisé par Stripe. Code promo à l&apos;étape
            suivante.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
