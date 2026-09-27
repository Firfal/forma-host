"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import type { SchoolLegalDoc } from "@shared/legal";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

/** Informations légales de l'école (pages légales, factures). */
export function useSchoolLegal(schoolId: string | null | undefined) {
  const ref = useMemo(
    () => (schoolId ? doc(db, "creators", schoolId, "legal", "info") : null),
    [schoolId],
  );
  return useDocData<SchoolLegalDoc>(ref);
}
