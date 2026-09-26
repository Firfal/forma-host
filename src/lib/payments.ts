"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import { sameStripeMode, type PlatformSettingsDoc, type SchoolStripeDoc } from "@shared/payments";
import type { TimestampLike } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

/** Compte Stripe relié à l'école (null : aucun). */
export function useSchoolStripe(schoolId: string | null | undefined) {
  const ref = useMemo(
    () => (schoolId ? doc(db, "creators", schoolId, "private", "stripe") : null),
    [schoolId],
  );
  return useDocData<SchoolStripeDoc<TimestampLike>>(ref);
}

/** Paiements activés sur la plateforme (clé Stripe configurée), en mode test ou réel. */
export function usePaymentsEnabled() {
  const ref = useMemo(() => doc(db, "platform", "settings"), []);
  const { data, loading } = useDocData<PlatformSettingsDoc>(ref);
  return {
    enabled: Boolean(data?.paymentsEnabled),
    livemode: Boolean(data?.stripeLivemode),
    loading,
  };
}

/**
 * Paiements d'une école dans le mode de la plateforme : `stripe` est null si aucun compte n'est
 * relié, ou s'il l'a été dans l'autre mode (`staleAccount` : compte de test après le passage
 * en réel, à reconnecter).
 */
export function useSchoolPayments(schoolId: string | null | undefined) {
  const { data: stripe, loading } = useSchoolStripe(schoolId);
  const platform = usePaymentsEnabled();
  const current = stripe && sameStripeMode(stripe.livemode, platform.livemode) ? stripe : null;
  return {
    enabled: platform.enabled,
    livemode: platform.livemode,
    stripe: current,
    staleAccount: Boolean(stripe && !current),
    active: Boolean(platform.enabled && current?.chargesEnabled),
    loading: loading || platform.loading,
  };
}
