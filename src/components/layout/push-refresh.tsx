"use client";

import { useAuth } from "@/lib/auth";
import { usePushRefresh } from "@/lib/push";

/** Garde à jour le token push de l'appareil (s'il a été activé dans Mon compte). */
export function PushRefresh() {
  const { user } = useAuth();
  usePushRefresh(user?.uid);
  return null;
}
