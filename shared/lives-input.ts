import { z } from "zod";

/** Saisie d'un direct (onglet Directs de la formation). */

const httpUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(2000, "Lien trop long")
    .url(message)
    .refine((url) => /^https?:\/\//.test(url), message);

export const liveInput = z.object({
  title: z.string().trim().min(1, "Donne un titre au direct").max(120, "120 caractères maximum"),
  description: z.string().trim().max(2000, "2000 caractères maximum"),
  startsAt: z.date({ message: "Date et heure du direct" }),
  durationMin: z.number().int().min(15).max(480),
  joinUrl: httpUrl("Lien de connexion invalide (Zoom, Meet, Teams… commençant par https://)"),
});
export type LiveInput = z.infer<typeof liveInput>;

export const replayUrlSchema = httpUrl("Lien du replay invalide (https://…)");
