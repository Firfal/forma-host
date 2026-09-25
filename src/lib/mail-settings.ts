"use client";

import { doc } from "firebase/firestore";
import { useMemo } from "react";
import { paths } from "@shared/paths";
import type { MailSettingsDoc } from "@shared/types";
import { db } from "./firebase/client";
import { useDocData } from "./hooks";

/** Réglages d'envoi des emails du formateur (null : envoi non configuré). */
export function useMailSettings(uid: string | null | undefined) {
  const ref = useMemo(() => (uid ? doc(db, paths.creatorMailSettings(uid)) : null), [uid]);
  return useDocData<MailSettingsDoc>(ref);
}
