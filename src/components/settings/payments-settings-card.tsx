"use client";

import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { callConnectStripe, callRefreshStripeStatus, errorMessage } from "@/lib/firebase/callables";
import { usePaymentsEnabled, useSchoolStripe } from "@/lib/payments";
import { useSchool } from "@/lib/school";

/** Compte Stripe de l'école : l'argent des ventes va directement au formateur (0 % de commission). */
export function PaymentsSettingsCard() {
  const { schoolId } = useSchool();
  const { data: stripe, loading } = useSchoolStripe(schoolId);
  const { enabled, loading: platformLoading } = usePaymentsEnabled();
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const refreshed = useRef(false);

  // Retour de l'onboarding Stripe (?stripe=retour) : on relit l'état du compte.
  useEffect(() => {
    if (refreshed.current || !searchParams.get("stripe")) return;
    refreshed.current = true;
    callRefreshStripeStatus()
      .then(({ chargesEnabled }) => {
        if (chargesEnabled)
          toast.success("Compte Stripe relié : tes formations peuvent être vendues");
      })
      .catch(() => undefined)
      .finally(() => router.replace("/admin/parametres"));
  }, [searchParams, router]);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await callConnectStripe();
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  const status = !stripe ? "none" : stripe.chargesEnabled ? "active" : "incomplete";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paiements</CardTitle>
        {loading || platformLoading ? null : status === "active" ? (
          <Badge tone="success">Actif</Badge>
        ) : status === "incomplete" ? (
          <Badge tone="warning">À finaliser</Badge>
        ) : (
          <Badge tone="neutral">Non connecté</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          Vends tes formations en direct avec Stripe : paiement par carte sur une page sécurisée,
          accès donné automatiquement, codes promo. L&apos;argent va directement sur ton compte
          Stripe, sans commission de la plateforme (seuls les frais Stripe s&apos;appliquent).
        </p>

        {!platformLoading && !enabled ? (
          <div className="flex gap-2.5 rounded-md bg-surface px-3 py-2.5 text-[13px] text-muted">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>Les paiements en ligne ne sont pas encore activés sur la plateforme.</p>
          </div>
        ) : status === "active" ? (
          <div className="flex gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>
              Ton compte Stripe est actif. Fixe le prix de chaque formation dans son onglet « Vente
              ».
            </p>
          </div>
        ) : status === "incomplete" ? (
          <div className="flex gap-2.5 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Stripe attend encore des informations (identité, IBAN…) avant d&apos;autoriser les
              paiements.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {enabled && status !== "active" ? (
            <Button onClick={connect} disabled={busy || loading}>
              <CreditCard />
              {busy
                ? "Redirection vers Stripe…"
                : status === "none"
                  ? "Connecter mon compte Stripe"
                  : "Finaliser mon compte Stripe"}
            </Button>
          ) : null}
          {status !== "none" ? (
            <Button asChild variant="secondary">
              <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">
                <ExternalLink /> Tableau de bord Stripe
              </a>
            </Button>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}
