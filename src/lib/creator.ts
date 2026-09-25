"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import type { CreatorDoc } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

export function useCreator(creatorId: string | null | undefined) {
  const ref = useMemo(() => (creatorId ? doc(db, "creators", creatorId) : null), [creatorId]);
  return useDocData<CreatorDoc>(ref);
}
