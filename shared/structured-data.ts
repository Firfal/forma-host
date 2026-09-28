/**
 * Données structurées schema.org (JSON-LD) des pages publiques : Google peut afficher la
 * formation (nom, école, prix) dans ses résultats.
 */

type JsonLd = Record<string, unknown>;

export function schoolJsonLd(school: {
  name: string;
  url: string;
  logoUrl: string | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: school.name,
    url: school.url,
    ...(school.logoUrl ? { logo: school.logoUrl } : {}),
  };
}

export function courseJsonLd(input: {
  name: string;
  description: string;
  url: string;
  imageUrl: string | null;
  school: { name: string; url: string };
  /** Prix en centimes, si la formation se vend en ligne. */
  price: { amount: number; currency: string } | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: input.name,
    description: input.description || input.name,
    url: input.url,
    inLanguage: "fr",
    ...(input.imageUrl ? { image: input.imageUrl } : {}),
    provider: {
      "@type": "EducationalOrganization",
      name: input.school.name,
      url: input.school.url,
    },
    hasCourseInstance: { "@type": "CourseInstance", courseMode: "Online" },
    ...(input.price
      ? {
          offers: {
            "@type": "Offer",
            category: "Paid",
            price: (input.price.amount / 100).toFixed(2),
            priceCurrency: input.price.currency.toUpperCase(),
            availability: "https://schema.org/InStock",
            url: input.url,
          },
        }
      : {}),
  };
}

/** Contenu d'une balise <script type="application/ld+json"> (« < » échappé : pas d'injection). */
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
