import { z } from "zod";
import { INSTALLMENT_OPTIONS, MAX_PRICE_CENTS, MIN_PRICE_CENTS } from "./payments";

/** Validation des saisies de paiement (callables, formulaires formateur). */

export const coursePriceSchema = z.object({
  amount: z
    .number()
    .int()
    .min(MIN_PRICE_CENTS, "Prix minimum : 1 €")
    .max(MAX_PRICE_CENTS, "Prix maximum : 10 000 €"),
  currency: z.literal("eur"),
  installments: z
    .array(z.union(INSTALLMENT_OPTIONS.map((count) => z.literal(count))))
    .max(INSTALLMENT_OPTIONS.length)
    .optional(),
});

export const createCheckoutInput = z.object({
  courseId: z.string().min(1).max(128),
  /** Paiement en plusieurs fois (nombre d'échéances) ; absent : paiement unique. */
  installments: z.number().int().min(2).max(4).nullish(),
  /** CGV acceptées et renonciation au droit de rétractation (accès immédiat). */
  acceptTerms: z.literal(true, { message: "Accepte les conditions pour continuer" }),
});
export type CreateCheckoutInput = z.infer<typeof createCheckoutInput>;

export const promoCodeInput = z
  .object({
    courseId: z.string().min(1).max(128),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,30}$/, "3 à 30 caractères : lettres, chiffres et tirets"),
    kind: z.enum(["percent", "amount"]),
    /** Pourcentage (1 à 100) ou montant en centimes. */
    value: z.number().int().positive(),
    maxRedemptions: z.number().int().min(1).max(100_000).nullish(),
    /** Date d'expiration (ISO 8601). */
    expiresAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "percent" && value.value > 100) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "100 % maximum" });
    }
    if (value.expiresAt && Date.parse(value.expiresAt) <= Date.now()) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Date déjà passée" });
    }
  });
export type PromoCodeInput = z.infer<typeof promoCodeInput>;

export const promoCodeIdInput = z.object({
  courseId: z.string().min(1).max(128),
  promoId: z.string().min(1).max(128),
});
export type PromoCodeIdInput = z.infer<typeof promoCodeIdInput>;
