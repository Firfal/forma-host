import { z } from "zod";
import type { CourseReviewInput } from "./attendance";

/** Avis de fin de formation (note, recommandation, commentaire). */
export const courseReviewInput: z.ZodType<CourseReviewInput> = z.object({
  rating: z.number().int().min(1, "Choisis une note").max(5),
  recommend: z.boolean(),
  comment: z.string().trim().max(2000, "2000 caractères maximum"),
});
