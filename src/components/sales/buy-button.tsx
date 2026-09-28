"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { toast } from "sonner";
import type { CheckoutDialogProps } from "./checkout-dialog";

type CheckoutDialogComponent = ComponentType<
  CheckoutDialogProps & { open: boolean; onOpenChange: (open: boolean) => void }
>;

const loadCheckout = () => import("./checkout-dialog");

/**
 * Bouton d'achat de la page de vente. La fenêtre de commande (Firebase, paiement) est chargée à
 * la demande : préchargée quand le navigateur est libre ou au survol, ouverte au clic.
 */
export function BuyButton({
  label,
  className,
  ...checkout
}: CheckoutDialogProps & { label: string; className?: string }) {
  const [Checkout, setCheckout] = useState<CheckoutDialogComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prefetch = () => void loadCheckout().catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = setTimeout(prefetch, 3000);
    return () => clearTimeout(timer);
  }, []);

  async function openCheckout() {
    if (!Checkout) {
      setLoading(true);
      try {
        const { CheckoutDialog } = await loadCheckout();
        setCheckout(() => CheckoutDialog);
      } catch {
        toast.error("Connexion impossible. Vérifie ta connexion internet et réessaie.");
        return;
      } finally {
        setLoading(false);
      }
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={openCheckout}
        onPointerEnter={() => void loadCheckout().catch(() => undefined)}
        aria-busy={loading}
      >
        {label}{" "}
        {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
      </button>
      {Checkout ? <Checkout {...checkout} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
