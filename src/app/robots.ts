import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/** Espaces privés fermés aux moteurs de recherche ; plan du site propre à chaque domaine. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "")
    .split(",")[0]
    .trim();
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0] ?? "https";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/attestations",
        "/bienvenue",
        "/communaute",
        "/compte",
        "/domaines",
        "/factures",
        "/formations",
        "/merci",
        "/messages",
        "/plateforme",
      ],
    },
    sitemap: host ? `${proto}://${host}/sitemap.xml` : undefined,
  };
}
