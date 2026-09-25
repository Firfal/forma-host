"use client";

import { useSearchParams } from "next/navigation";
import { routes } from "@shared/paths";

/** Destination après connexion (?next=/chemin), limitée aux chemins internes. */
export function useNextPath(): string {
  const next = useSearchParams().get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : routes.myCourses;
}
