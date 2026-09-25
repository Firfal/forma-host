"use client";

import { useSearchParams } from "next/navigation";
import { routes } from "@shared/paths";

/** Destination après connexion (?next=/chemin), limitée aux chemins internes. */
export function useNextPath(): string | null {
  const next = useSearchParams().get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/** Accueil par défaut : l'espace formateur pour un formateur, sinon ses formations. */
export function homeFor(isCreator: boolean): string {
  return isCreator ? routes.admin : routes.myCourses;
}
