import { z } from "zod";
import { emailSchema } from "./schemas";
import { isReservedSlug, isValidSlug } from "./slug";

/** Profil public d'une école (Admin > Paramètres), enregistré par la callable updateSchoolProfile. */

export const schoolSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidSlug, "Adresse invalide : lettres minuscules, chiffres et tirets uniquement")
  .refine((slug) => !isReservedSlug(slug), "Cette adresse est réservée, choisis-en une autre");

export const schoolProfileInput = z.object({
  name: z.string().trim().min(1, "Nom requis").max(80, "80 caractères maximum"),
  slug: schoolSlugSchema,
  logoUrl: z
    .url({ protocol: /^https$/, message: "URL du logo invalide" })
    .max(2000)
    .nullish(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide (ex. #9d72f9)"),
  supportEmail: emailSchema.nullish(),
});
export type SchoolProfileInput = z.infer<typeof schoolProfileInput>;

/** Anciennes adresses après un changement d'adresse : l'ancienne est gardée pour la redirection. */
export function nextPreviousSlugs(
  current: { slug: string; previousSlugs?: string[] },
  newSlug: string,
): string[] {
  const all =
    newSlug === current.slug
      ? (current.previousSlugs ?? [])
      : [...(current.previousSlugs ?? []), current.slug];
  return [...new Set(all)].filter((slug) => slug !== newSlug);
}
