"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import type { PlatformSettingsDoc, SchoolStripeDoc } from "@shared/payments";
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

/** Paiements activés sur la plateforme (clé Stripe configurée). */
export function usePaymentsEnabled() {
  const ref = useMemo(() => doc(db, "platform", "settings"), []);
  const { data, loading } = useDocData<PlatformSettingsDoc>(ref);
  return { enabled: Boolean(data?.paymentsEnabled), loading };
}
