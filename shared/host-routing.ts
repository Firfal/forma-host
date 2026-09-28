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

/** Préfixe interne des pages servies sur le domaine d'une école (/domaines/{domaine}/…). */
export const DOMAIN_PAGES_PREFIX = "/domaines";

/**
 * Sur le domaine d'une école : « / » affiche la page de l'école, « /formation » sa page de vente
 * et « /legal/cgv » ses pages légales (chemins internes /domaines/{domaine}/…). null : route de
 * l'application (/connexion, /formations…), servie telle quelle.
 */
export function domainRewritePath(pathname: string, domain: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const base = `${DOMAIN_PAGES_PREFIX}/${domain}`;
  if (segments.length === 0) return base;
  const [first] = segments;
  if (first === "legal" && segments.length === 2) return `${base}/legal/${segments[1]}`;
  if (
    segments.length > 1 ||
    RESERVED_SLUGS.has(first) ||
    first.startsWith("_") ||
    first.includes(".")
  ) {
    return null;
  }
  return `${base}/${first}`;
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
