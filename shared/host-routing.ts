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
  // Pages légales de l'école : /legal/cgv sur son domaine, /{ecole}/legal/cgv sur la plateforme.
  if (first === "legal") return { type: "rewrite", pathname: `/${slug}${pathname}` };
  if (RESERVED_SLUGS.has(first) || first.startsWith("_") || first.includes(".")) {
    return { type: "next" };
  }
  if (first === slug) {
    return { type: "redirect", pathname: `/${segments.slice(1).join("/")}` };
  }
  if (segments.length === 1) return { type: "rewrite", pathname: `/${slug}/${first}` };
  return { type: "next" };
}

type SchoolAddress = { slug: string; customDomain?: { host: string; status: string } | null };

/**
 * Lien vers une page publique de l'école (« » : accueil, « formation », « legal/cgv ») : sur son
 * domaine s'il est actif, directement à l'adresse finale (sans passer par la redirection
 * /ecole/… → /… du domaine) ; sinon /ecole/… sur l'adresse courante.
 */
export function schoolHref(school: SchoolAddress, subpath = ""): string {
  const domain = school.customDomain?.status === "active" ? school.customDomain.host : null;
  if (domain) return `https://${domain}/${subpath}`;
  return `/${school.slug}${subpath ? `/${subpath}` : ""}`;
}

/**
 * Adresse publique canonique d'une école ou d'une page de vente : son domaine s'il est actif
 * (https://app.ecolemotion.com/formation), sinon l'adresse de la plateforme (/ecole/formation).
 */
export function publicSchoolUrl(
  school: { slug: string; customDomain?: { host: string; status: string } | null },
  appUrl: string,
  courseSlug?: string,
): string {
  const domain = school.customDomain?.status === "active" ? school.customDomain.host : null;
  if (domain) return `https://${domain}${courseSlug ? `/${courseSlug}` : "/"}`;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/${school.slug}${courseSlug ? `/${courseSlug}` : ""}`;
}
