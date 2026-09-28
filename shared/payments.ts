import type { OrderInvoice } from "./invoices";

/**
 * Paiements des formations (Stripe Connect, 0 % de commission) : le formateur relie son compte
 * Stripe, fixe un prix par formation et crée des codes promo. L'accès est donné après paiement.
 */

export interface CoursePrice {
  /** Montant en centimes. */
  amount: number;
  currency: "eur";
  /** Paiement en plusieurs fois proposé (nombres d'échéances mensuelles, ex. [3]). */
  installments?: number[];
}

/** Nombres d'échéances proposables, et prix minimum pour les proposer. */
export const INSTALLMENT_OPTIONS = [2, 3, 4] as const;
export const MIN_INSTALLMENTS_PRICE_CENTS = 5000;

/**
 * Échéancier sans frais : des mensualités égales (arrondies au centime inférieur), le reliquat
 * de quelques centimes s'ajoutant au premier paiement, pour un total exact.
 */
export function installmentPlan(total: number, count: number) {
  const monthly = Math.floor(total / count);
  return { count, first: total - monthly * (count - 1), monthly };
}

/** « 65,68 € aujourd'hui, puis 2 × 65,66 € par mois ». */
export function installmentLabel(total: number, count: number): string {
  const plan = installmentPlan(total, count);
  const rest = `${count - 1} × ${formatPrice(plan.monthly)} par mois`;
  return `${formatPrice(plan.first)} aujourd'hui, puis ${rest}`;
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

/** Compte Stripe relié à l'école (creators/{id}/private/stripe), écrit par les Functions. */
export interface SchoolStripeDoc<T = unknown> {
  accountId: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  /** Compte créé avec une clé réelle (absent : mode test). */
  livemode?: boolean;
  updatedAt: T;
}

/** Clé Stripe réelle (`sk_live_…`, `rk_live_…`) ou de test. */
export function isLiveKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key);
}

/**
 * Même mode Stripe (test ou réel) ? Les comptes, produits et codes promo créés en test
 * n'existent pas en réel : au changement de clé, ils sont ignorés et recréés.
 */
export function sameStripeMode(a: boolean | undefined, b: boolean | undefined): boolean {
  return (a ?? false) === (b ?? false);
}

/** Réglage public de la plateforme (platform/settings). */
export interface PlatformSettingsDoc {
  paymentsEnabled: boolean;
  /** Clé Stripe réelle (absent ou false : mode test). */
  stripeLivemode?: boolean;
}

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
  /** Compte Stripe de l'école au moment de la création (absent sur les codes plus anciens). */
  stripeAccountId?: string;
  /** Valable aussi en paiement en plusieurs fois (absent : oui). */
  installments?: boolean;
  /** Utilisations en plusieurs fois (comptées par la plateforme, pas par Stripe). */
  installmentRedemptions?: number;
  createdAt: T;
}

export function promoLabel(promo: Pick<PromoCodeDoc, "kind" | "value">): string {
  return promo.kind === "percent" ? `-${promo.value} %` : `-${formatPrice(promo.value)}`;
}

export type PromoDiscount = Pick<PromoCodeDoc, "kind" | "value">;

/** Prix après remise (centimes), jamais négatif. */
export function discountedAmount(amount: number, promo: PromoDiscount): number {
  const discounted =
    promo.kind === "percent"
      ? Math.round((amount * (100 - promo.value)) / 100)
      : amount - promo.value;
  return Math.max(0, discounted);
}

/** Utilisations d'un code, tous modes de paiement confondus. */
export function promoRedemptions(
  promo: Pick<PromoCodeDoc, "timesRedeemed" | "installmentRedemptions">,
): number {
  return promo.timesRedeemed + (promo.installmentRedemptions ?? 0);
}

/** Code promo vérifié avant le paiement (fenêtre de commande). */
export interface CheckedPromo extends PromoDiscount {
  code: string;
  /** Valable en paiement en plusieurs fois. */
  installments: boolean;
}

/** Échéancier d'un achat en plusieurs fois (abonnement Stripe arrêté après la dernière). */
export interface OrderInstallments {
  count: number;
  /** Échéances payées (identifiants des factures Stripe réglées). */
  paidInvoiceIds: string[];
  first: number;
  monthly: number;
  subscriptionId: string | null;
  customerId: string | null;
  /** active : en cours ; completed : tout payé ; past_due : échéance impayée ; canceled : arrêté. */
  status: "active" | "completed" | "past_due" | "canceled";
}

/** orders/{sessionId} : achat d'une formation (lu par l'équipe de l'école). */
export interface OrderDoc<T = unknown> {
  schoolId: string;
  courseId: string;
  /** Titre de la formation au moment de l'achat (absent sur les premières commandes). */
  courseTitle?: string;
  email: string;
  name: string | null;
  amount: number;
  currency: string;
  promoCode: string | null;
  paymentIntentId: string | null;
  status: "paid" | "refunded";
  /** Paiement réel (absent ou false : paiement de test). */
  livemode?: boolean;
  /** CGV acceptées et renonciation à la rétractation (ISO 8601, avant le paiement). */
  termsAcceptedAt?: string | null;
  /** Adresse de facturation saisie chez Stripe (si demandée). */
  billingAddress?: string | null;
  /** Facture émise au paiement (absente : informations légales manquantes à ce moment). */
  invoice?: OrderInvoice<T> | null;
  /** Paiement en plusieurs fois (absent : paiement unique). */
  installments?: OrderInstallments | null;
  createdAt: T;
}
