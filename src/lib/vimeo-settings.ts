"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import { paths } from "@shared/paths";
import type { VimeoSettingsDoc } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

/** Compte Vimeo relié à l'école (null : aucun). */
export function useVimeoSettings(uid: string | null | undefined) {
  const ref = useMemo(() => (uid ? doc(db, paths.creatorVimeoSettings(uid)) : null), [uid]);
  return useDocData<VimeoSettingsDoc>(ref);
}
