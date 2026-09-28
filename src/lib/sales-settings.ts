"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import { salesSettingsOf, type SalesSettingsDoc } from "@shared/sales-settings";
import type { TimestampLike } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

/** Réglages de vente de l'école (impayés, facturation), avec leurs valeurs par défaut. */
export function useSalesSettings(schoolId: string | null | undefined) {
  const ref = useMemo(
    () => (schoolId ? doc(db, "creators", schoolId, "private", "sales") : null),
    [schoolId],
  );
  const { data, loading } = useDocData<SalesSettingsDoc<TimestampLike>>(ref);
  return { settings: salesSettingsOf(data), loading };
}
