import { z } from "zod";
import type { DripSettings } from "./drip";

/** Réglage de l'ouverture progressive (1 à 90 jours entre deux chapitres). */
export const dripSchema: z.ZodType<DripSettings> = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("sequential") }),
  z.object({ mode: z.literal("schedule"), intervalDays: z.number().int().min(1).max(90) }),
]);
