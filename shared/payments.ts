import { z } from "zod";

/**
 * Paiements des formations (Stripe Connect, 0 % de commission) : le formateur relie son compte
 * Stripe, fixe un prix par formation et crée des codes promo. L'accès est donné après paiement.
 */

export interface CoursePrice {
  /** Montant en centimes. */
  amount: number;
  currency: "eur";
}

export const MIN_PRICE_CENTS = 100;
export const MAX_PRICE_CENTS = 1_000_000;

export function formatPrice(amount: number, currency = "eur"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
  }).format(amount / 100);
}

/** « 197 », « 197,5 », « 197.50 € » → centimes (null si invalide). */
export function parsePriceInput(input: string): number | null {
  const cleaned = input.replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const coursePriceSchema = z.object({
  amount: z
    .number()
    .int()
    .min(MIN_PRICE_CENTS, "Prix minimum : 1 €")
    .max(MAX_PRICE_CENTS, "Prix maximum : 10 000 €"),
  currency: z.literal("eur"),
});

/** Compte Stripe relié à l'école (creators/{id}/private/stripe), écrit par les Functions. */
export interface SchoolStripeDoc<T = unknown> {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  updatedAt: T;
}

/** Réglage public de la plateforme (platform/settings). */
export interface PlatformSettingsDoc {
  paymentsEnabled: boolean;
}

export const createCheckoutInput = z.object({ courseId: z.string().min(1).max(128) });
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

/** courses/{id}/promoCodes/{promoId} : miroir du code promo créé chez Stripe. */
export interface PromoCodeDoc<T = unknown> {
  code: string;
  kind: "percent" | "amount";
  value: number;
  maxRedemptions: number | null;
  expiresAt: T | null;
  active: boolean;
  timesRedeemed: number;
  stripePromotionCodeId: string;
  stripeCouponId: string;
  createdAt: T;
}

export function promoLabel(promo: Pick<PromoCodeDoc, "kind" | "value">): string {
  return promo.kind === "percent" ? `-${promo.value} %` : `-${formatPrice(promo.value)}`;
}

/** orders/{sessionId} : achat d'une formation (lu par l'équipe de l'école). */
export interface OrderDoc<T = unknown> {
  schoolId: string;
  courseId: string;
  email: string;
  name: string | null;
  amount: number;
  currency: string;
  promoCode: string | null;
  paymentIntentId: string | null;
  status: "paid" | "refunded";
  createdAt: T;
}
