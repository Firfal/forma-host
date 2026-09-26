import { RESERVED_SLUGS } from "./constants";

/** Hôtes de la plateforme (pas de réécriture) : adresse App Hosting, domaine de la plateforme, local. */
export function isPlatformHost(host: string, appHost: string): boolean {
  return (
    host === appHost ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.endsWith(".hosted.app") ||
    host.endsWith(".run.app")
  );
}

export type HostRoute =
  { type: "next" } | { type: "rewrite"; pathname: string } | { type: "redirect"; pathname: string };

/**
 * Sur le domaine d'une école : « / » affiche la page de l'école et « /formation » sa page de vente.
 * Les liens au format de la plateforme (/ecole-motion/formation) redirigent vers l'adresse courte ;
 * les routes de l'application (/connexion, /formations…) restent inchangées.
 */
export function routeForSchoolHost(pathname: string, slug: string): HostRoute {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return { type: "rewrite", pathname: `/${slug}` };
  const [first] = segments;
  if (RESERVED_SLUGS.has(first) || first.startsWith("_") || first.includes(".")) {
    return { type: "next" };
  }
  if (first === slug) {
    return { type: "redirect", pathname: `/${segments.slice(1).join("/")}` };
  }
  if (segments.length === 1) return { type: "rewrite", pathname: `/${slug}/${first}` };
  return { type: "next" };
}
