"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { callCreateCheckoutSession, errorMessage } from "@/lib/firebase/callables";

/** Achat d'une formation : redirection vers la page de paiement Stripe de l'école. */
export function BuyButton({
  courseId,
  label,
  className,
}: {
  courseId: string;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function buy() {
    setBusy(true);
    try {
      const { url } = await callCreateCheckoutSession({ courseId });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={buy} disabled={busy} className={className}>
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Redirection vers le paiement…
        </>
      ) : (
        <>
          {label} <ArrowRight className="size-4" />
        </>
      )}
    </button>
  );
}
