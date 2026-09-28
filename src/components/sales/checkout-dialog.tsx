"use client";

import { ArrowRight, Loader2, Lock, Tag, X } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";
import { toast } from "sonner";
import { brandCssVars } from "@shared/color";
import {
  discountedAmount,
  formatPrice,
  installmentLabel,
  promoLabel,
  type CheckedPromo,
  type CoursePrice,
} from "@shared/payments";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import {
  callCheckPromoCode,
  callCreateCheckoutSession,
  errorMessage,
} from "@/lib/firebase/callables";

/** Code promo de la commande : saisi, vérifié par le serveur, prix remisé affiché. */
function PromoField({
  courseId,
  promo,
  onChange,
  disabled,
}: {
  courseId: string;
  promo: CheckedPromo | null;
  onChange: (promo: CheckedPromo | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setChecking(true);
    setError(null);
    try {
      onChange(await callCheckPromoCode({ courseId, code }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  if (promo) {
    return (
      <p className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-[13px] text-success">
        <Tag className="size-3.5 shrink-0" />
        <span className="flex-1">
          Code <span className="font-semibold">{promo.code}</span> : {promoLabel(promo)}
        </span>
        <button
          type="button"
          aria-label="Retirer le code promo"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="rounded p-0.5 hover:bg-success/10"
        >
          <X className="size-3.5" />
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-medium text-muted underline hover:text-ink"
      >
        J&apos;ai un code promo
      </button>
    );
  }
  return (
    <form onSubmit={apply} className="space-y-1">
      <div className="flex gap-2">
        <input
          aria-label="Code promo"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          autoFocus
          maxLength={30}
          placeholder="CODE"
          className="h-9 min-w-0 flex-1 rounded-md border border-line px-3 font-mono text-sm uppercase focus:border-ink/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={checking || !code.trim()}
          className="h-9 rounded-md border border-line px-3 text-sm font-medium hover:bg-surface disabled:opacity-50"
        >
          {checking ? "…" : "Appliquer"}
        </button>
      </div>
      {error ? (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export interface CheckoutDialogProps {
  courseId: string;
  courseTitle: string;
  price: CoursePrice;
  brandColor: string;
  /** CGV de l'école (null : pas encore publiées). */
  termsUrl: string | null;
}

/**
 * Achat d'une formation : récapitulatif, acceptation des CGV et renonciation au droit de
 * rétractation (accès immédiat à un contenu numérique), puis page de paiement Stripe de l'école.
 * Chargé à la demande par BuyButton (Firebase n'alourdit pas la page de vente).
 */
export function CheckoutDialog({
  courseId,
  courseTitle,
  price,
  brandColor,
  termsUrl,
  open,
  onOpenChange,
}: CheckoutDialogProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Nombre d'échéances choisi (null : paiement en une fois). */
  const [installments, setInstallments] = useState<number | null>(null);
  const [promo, setPromo] = useState<CheckedPromo | null>(null);
  const options = price.installments ?? [];
  // Code réservé par le formateur au paiement en une fois : sans effet sur l'échéancier.
  const promoApplies = Boolean(promo && (installments === null || promo.installments));
  const total = promo && promoApplies ? discountedAmount(price.amount, promo) : price.amount;
  const totalFor = (count: number | null) =>
    promo && (count === null || promo.installments)
      ? discountedAmount(price.amount, promo)
      : price.amount;

  async function pay() {
    setBusy(true);
    try {
      const { url } = await callCreateCheckoutSession({
        courseId,
        acceptTerms: true,
        installments,
        promoCode: promoApplies ? promo!.code : null,
      });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title="Ta commande"
        style={brandCssVars(brandColor) as CSSProperties}
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-md border border-line px-3 py-3">
            <div>
              <p className="text-sm font-medium">{courseTitle}</p>
              <p className="text-[12px] text-muted">Formation en ligne, accès immédiat</p>
            </div>
            <p className="shrink-0 text-right">
              {total !== price.amount ? (
                <span className="block text-[12px] text-muted line-through">
                  {formatPrice(price.amount)}
                </span>
              ) : null}
              <span className="text-base font-semibold">{formatPrice(total)}</span>
            </p>
          </div>

          <PromoField courseId={courseId} promo={promo} onChange={setPromo} disabled={busy} />
          {promo && !promoApplies ? (
            <p className="text-[12px] text-muted">
              Ce code n&apos;est valable qu&apos;en paiement en une fois.
            </p>
          ) : null}

          {options.length ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-[13px] font-medium">Paiement</legend>
              {[null, ...options].map((count) => (
                <label
                  key={count ?? 1}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px]",
                    installments === count
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="installments"
                    checked={installments === count}
                    onChange={() => setInstallments(count)}
                    className="mt-0.5 size-4 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="block font-medium">
                      {count ? `En ${count} fois sans frais` : "En une fois"}
                    </span>
                    <span className="block text-muted">
                      {count
                        ? installmentLabel(totalFor(count), count)
                        : formatPrice(totalFor(null))}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

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
              {installments ? " J'autorise le prélèvement des mensualités sur ma carte." : null}
            </span>
          </label>

          <button
            type="button"
            onClick={pay}
            disabled={!accepted || busy}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
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
            <Lock className="size-3.5" /> Paiement sécurisé par Stripe.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
