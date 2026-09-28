import { FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import {
  discountedAmount,
  installmentPlan,
  isLiveKey,
  MIN_INSTALLMENTS_PRICE_CENTS,
  MIN_PRICE_CENTS,
  sameStripeMode,
  type CheckedPromo,
  type CoursePrice,
  type OrderDoc,
  type OrderInstallments,
  type PromoCodeDoc,
  type SchoolStripeDoc,
  type StripeInvoiceLink,
} from "@shared/payments";
import type { PromoCodeInput } from "@shared/payments-input";
import { routes } from "@shared/paths";
import { schoolAdminSet } from "@shared/school";
import type { CourseDoc, CreatorDoc } from "@shared/types";
import { grantAccessToStudents } from "./access";
import { db } from "./db";
import { issueCreditNote, issueInvoice } from "./invoices";
import { readSalesSettings } from "./sales-settings";

/**
 * Paiements Stripe Connect : chaque école relie son propre compte Stripe (compte « Standard »,
 * frais Stripe à sa charge, 0 % de commission pour la plateforme). Les sessions Checkout et
 * les codes promo sont créés sur le compte de l'école ; le webhook Connect donne l'accès.
 *
 * Mode test ou réel : suit la clé de la plateforme. Un compte relié dans l'autre mode est ignoré
 * (l'école reconnecte Stripe) et ses codes promo sont désactivés.
 */

/** Erreur au message déjà lisible par le formateur ou l'acheteur. */
export class PaymentError extends Error {}

export interface CheckoutRequest {
  accountId: string;
  productId: string;
  price: CoursePrice;
  courseId: string;
  schoolId: string;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Acceptation des CGV et renonciation à la rétractation (ISO 8601). */
  termsAcceptedAt: string;
  /** Paiement en plusieurs fois : abonnement mensuel arrêté après la dernière échéance. */
  installments: { count: number; first: number; monthly: number } | null;
  /** Montant total dû (prix, ou prix remisé par le code promo). */
  total: number;
  /** Code promo saisi dans la fenêtre de commande. */
  promo: { id: string; code: string; promotionCodeId: string } | null;
  /** Mode de facturation « Stripe » : facture Stripe créée pour un paiement unique. */
  stripeInvoice: boolean;
}

/** Rappel affiché sous le bouton de paiement Stripe. */
const CHECKOUT_TERMS_MESSAGE =
  "En payant, vous demandez l'accès immédiat à la formation et renoncez à votre droit de rétractation (article L221-28 du Code de la consommation).";

export interface PaymentsClient {
  /** Clé réelle (true) ou de test (false). */
  readonly livemode: boolean;
  createAccount(input: { email: string; schoolName: string; schoolId: string }): Promise<string>;
  accountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string>;
  getAccount(accountId: string): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }>;
  createProduct(accountId: string, name: string, courseId: string): Promise<string>;
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  createPromo(
    accountId: string,
    input: PromoCodeInput & { productId: string },
  ): Promise<{ promotionCodeId: string; couponId: string }>;
  promoRedemptions(accountId: string, promotionCodeId: string): Promise<number>;
  deactivatePromo(accountId: string, promotionCodeId: string): Promise<void>;
  /** Arrête l'abonnement d'un paiement en plusieurs fois (sans prorata ni nouvelle facture). */
  cancelSubscription(accountId: string, subscriptionId: string): Promise<void>;
  /** Facture Stripe (numéro, lien de consultation) ; null si introuvable. */
  getInvoice(accountId: string, invoiceId: string): Promise<StripeInvoiceLink | null>;
}

/** Client Stripe réel (clé secrète de la plateforme, requêtes sur le compte de l'école). */
export function stripeClient(secretKey: string): PaymentsClient {
  const stripe = new Stripe(secretKey);
  return {
    livemode: isLiveKey(secretKey),
    async createAccount({ email, schoolName, schoolId }) {
      const account = await stripe.accounts.create({
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          stripe_dashboard: { type: "full" },
          requirement_collection: "stripe",
        },
        email,
        business_profile: { name: schoolName },
        metadata: { schoolId },
      });
      return account.id;
    },
    async accountLink(accountId, returnUrl, refreshUrl) {
      const link = await stripe.accountLinks.create({
        account: accountId,
        return_url: returnUrl,
        refresh_url: refreshUrl,
        type: "account_onboarding",
      });
      return link.url;
    },
    async getAccount(accountId) {
      const account = await stripe.accounts.retrieve(accountId);
      return {
        chargesEnabled: Boolean(account.charges_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
      };
    },
    async createProduct(accountId, name, courseId) {
      const product = await stripe.products.create(
        { name, metadata: { courseId } },
        { stripeAccount: accountId },
      );
      return product.id;
    },
    async createCheckout(request) {
      const metadata = {
        courseId: request.courseId,
        schoolId: request.schoolId,
        termsAcceptedAt: request.termsAcceptedAt,
        totalAmount: String(request.total),
        installments: request.installments ? String(request.installments.count) : "",
        promoCode: request.promo?.code ?? "",
        promoId: request.promo?.id ?? "",
      };
      const common = {
        ...(request.email ? { customer_email: request.email } : {}),
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        metadata,
        custom_text: { submit: { message: CHECKOUT_TERMS_MESSAGE } },
        locale: "fr" as const,
      };
      const plan = request.installments;
      const params: Stripe.Checkout.SessionCreateParams = plan
        ? {
            ...common,
            // Mensualités : abonnement arrêté par le webhook après la dernière échéance.
            mode: "subscription",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: request.price.currency,
                  unit_amount: plan.monthly,
                  product: request.productId,
                  recurring: { interval: "month" },
                },
              },
              ...(plan.first > plan.monthly
                ? [
                    {
                      quantity: 1,
                      price_data: {
                        currency: request.price.currency,
                        unit_amount: plan.first - plan.monthly,
                        product_data: { name: "Arrondi du premier paiement" },
                      },
                    },
                  ]
                : []),
            ],
            subscription_data: {
              description: `Paiement en ${plan.count} fois sans frais`,
              metadata,
            },
          }
        : {
            ...common,
            mode: "payment",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: request.price.currency,
                  unit_amount: request.price.amount,
                  product: request.productId,
                },
              },
            ],
            // Code saisi dans la fenêtre de commande : appliqué (et compté) par Stripe ; sinon
            // l'acheteur peut encore en saisir un sur la page de paiement.
            ...(request.promo
              ? { discounts: [{ promotion_code: request.promo.promotionCodeId }] }
              : { allow_promotion_codes: true }),
            // Facturation par Stripe : facture du paiement (les échéances ont déjà la leur).
            ...(request.stripeInvoice
              ? { invoice_creation: { enabled: true, invoice_data: { metadata } } }
              : {}),
          };
      const session = await stripe.checkout.sessions.create(params, {
        stripeAccount: request.accountId,
      });
      if (!session.url) throw new PaymentError("Paiement indisponible pour le moment.");
      return { id: session.id, url: session.url };
    },
    async createPromo(accountId, input) {
      const coupon = await stripe.coupons.create(
        {
          ...(input.kind === "percent"
            ? { percent_off: input.value }
            : { amount_off: input.value, currency: "eur" }),
          duration: "once",
          applies_to: { products: [input.productId] },
          name: input.code,
        },
        { stripeAccount: accountId },
      );
      const promotion = await stripe.promotionCodes.create(
        {
          promotion: { type: "coupon", coupon: coupon.id },
          code: input.code,
          ...(input.maxRedemptions ? { max_redemptions: input.maxRedemptions } : {}),
          ...(input.expiresAt
            ? { expires_at: Math.floor(Date.parse(input.expiresAt) / 1000) }
            : {}),
        },
        { stripeAccount: accountId },
      );
      return { promotionCodeId: promotion.id, couponId: coupon.id };
    },
    async promoRedemptions(accountId, promotionCodeId) {
      const promotion = await stripe.promotionCodes.retrieve(promotionCodeId, undefined, {
        stripeAccount: accountId,
      });
      return promotion.times_redeemed;
    },
    async deactivatePromo(accountId, promotionCodeId) {
      await stripe.promotionCodes.update(
        promotionCodeId,
        { active: false },
        { stripeAccount: accountId },
      );
    },
    async cancelSubscription(accountId, subscriptionId) {
      await stripe.subscriptions.cancel(subscriptionId, {}, { stripeAccount: accountId });
    },
    async getInvoice(accountId, invoiceId) {
      const invoice = await stripe.invoices.retrieve(invoiceId, undefined, {
        stripeAccount: accountId,
      });
      return invoice.id
        ? {
            id: invoice.id,
            number: invoice.number ?? null,
            url: invoice.hosted_invoice_url ?? null,
            amount: invoice.amount_paid,
          }
        : null;
    },
  };
}

/** Message lisible pour une erreur Stripe (codes promo, compte). */
export function paymentErrorMessage(error: unknown): string {
  if (error instanceof PaymentError) return error.message;
  const stripeError = error as { type?: string; code?: string; message?: string };
  if (stripeError.code === "resource_already_exists") return "Ce code existe déjà.";
  if (stripeError.type?.startsWith("Stripe")) return `Stripe : ${stripeError.message ?? "erreur"}`;
  return "Paiement indisponible pour le moment.";
}

/** Compte Stripe de l'école dans le mode de la clé actuelle (null : aucun, ou autre mode). */
async function schoolStripe(schoolId: string, livemode: boolean): Promise<SchoolStripeDoc | null> {
  const snap = await db().doc(`creators/${schoolId}/private/stripe`).get();
  const stripe = snap.data() as SchoolStripeDoc | undefined;
  return stripe && sameStripeMode(stripe.livemode, livemode) ? stripe : null;
}

/** Codes promo actifs de l'école qui n'appartiennent pas à ce compte Stripe : désactivés. */
async function deactivateOtherAccountPromos(schoolId: string, accountId: string): Promise<void> {
  const courses = await db().collection("courses").where("creatorId", "==", schoolId).get();
  for (const course of courses.docs) {
    const promos = await course.ref.collection("promoCodes").where("active", "==", true).get();
    const stale = promos.docs.filter(
      (promo) => (promo.data() as PromoCodeDoc).stripeAccountId !== accountId,
    );
    if (!stale.length) continue;
    const batch = db().batch();
    for (const promo of stale) batch.update(promo.ref, { active: false });
    await batch.commit();
  }
}

/** Lien d'onboarding Stripe (compte créé au premier appel). */
export async function connectStripe(params: {
  schoolId: string;
  email: string;
  appUrl: string;
  client: PaymentsClient;
}): Promise<string> {
  const { schoolId, client } = params;
  let stripe = await schoolStripe(schoolId, client.livemode);
  if (!stripe) {
    const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
    if (!creator) throw new PaymentError("École introuvable.");
    const accountId = await client.createAccount({
      email: params.email,
      schoolName: creator.name,
      schoolId,
    });
    stripe = {
      accountId,
      chargesEnabled: false,
      detailsSubmitted: false,
      livemode: client.livemode,
      updatedAt: null,
    };
    const batch = db().batch();
    batch.set(db().doc(`creators/${schoolId}/private/stripe`), {
      ...stripe,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db().doc(`stripeAccounts/${accountId}`), { schoolId });
    await batch.commit();
    // Changement de mode (test → réel) : les codes de l'ancien compte n'existent pas ici.
    await deactivateOtherAccountPromos(schoolId, accountId);
  }
  const back = `${params.appUrl}${routes.adminSettings}`;
  return client.accountLink(stripe.accountId, `${back}?stripe=retour`, `${back}?stripe=relance`);
}

/** Relit l'état du compte Stripe (retour d'onboarding, webhook account.updated). */
export async function refreshStripeAccount(
  schoolId: string,
  client: PaymentsClient,
): Promise<SchoolStripeDoc | null> {
  const stripe = await schoolStripe(schoolId, client.livemode);
  if (!stripe) return null;
  const status = await client.getAccount(stripe.accountId);
  await db()
    .doc(`creators/${schoolId}/private/stripe`)
    .update({ ...status, updatedAt: FieldValue.serverTimestamp() });
  return { ...stripe, ...status };
}

/** Produit Stripe de la formation sur le compte de l'école (créé une fois). */
async function ensureProduct(
  courseId: string,
  course: CourseDoc,
  accountId: string,
  client: PaymentsClient,
): Promise<string> {
  const ref = db().doc(`courses/${courseId}/private/stripe`);
  const existing = (await ref.get()).data() as { productId: string; accountId: string } | undefined;
  if (existing && existing.accountId === accountId) return existing.productId;
  const productId = await client.createProduct(accountId, course.title, courseId);
  await ref.set({ productId, accountId });
  return productId;
}

/**
 * Code promo actif de la formation sur le compte Stripe actuel : non expiré, sous son nombre
 * maximal d'utilisations (en une fois et en plusieurs fois).
 */
async function findActivePromo(courseId: string, code: string, accountId: string) {
  const snap = await db()
    .collection(`courses/${courseId}/promoCodes`)
    .where("code", "==", code.trim().toUpperCase())
    .where("active", "==", true)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  const promo = doc?.data() as PromoCodeDoc<Timestamp> | undefined;
  const invalid = new PaymentError("Code promo invalide ou expiré.");
  if (!doc || !promo) throw invalid;
  if (promo.stripeAccountId && promo.stripeAccountId !== accountId) throw invalid;
  if (promo.expiresAt && promo.expiresAt.toMillis() <= Date.now()) throw invalid;
  const used = promo.timesRedeemed + (promo.installmentRedemptions ?? 0);
  if (promo.maxRedemptions && used >= promo.maxRedemptions) throw invalid;
  return { id: doc.id, promo };
}

async function activeCourseAccount(courseId: string, client: PaymentsClient) {
  const course = (await db().doc(`courses/${courseId}`).get()).data() as CourseDoc | undefined;
  if (!course || course.status !== "published") throw new PaymentError("Formation introuvable.");
  if (!course.price) throw new PaymentError("Cette formation n'est pas en vente.");
  const stripe = await schoolStripe(course.creatorId, client.livemode);
  if (!stripe?.chargesEnabled) {
    throw new PaymentError("Le paiement en ligne n'est pas encore activé pour cette formation.");
  }
  return { course, price: course.price, stripe };
}

/** Vérifie un code promo saisi dans la fenêtre de commande (prix remisé affiché avant paiement). */
export async function checkPromoCode(
  courseId: string,
  code: string,
  client: PaymentsClient,
): Promise<CheckedPromo> {
  const { price, stripe } = await activeCourseAccount(courseId, client);
  const { promo } = await findActivePromo(courseId, code, stripe.accountId);
  if (discountedAmount(price.amount, promo) < MIN_PRICE_CENTS) {
    throw new PaymentError("Ce code ne peut pas s'appliquer à ce prix.");
  }
  return {
    code: promo.code,
    kind: promo.kind,
    value: promo.value,
    installments: promo.installments !== false,
  };
}

/** Session de paiement pour une formation publiée, avec prix et compte Stripe actif. */
export async function createCheckout(params: {
  courseId: string;
  email: string | null;
  appUrl: string;
  client: PaymentsClient;
  termsAcceptedAt?: string;
  /** Nombre d'échéances (paiement en plusieurs fois) ; absent : paiement unique. */
  installments?: number | null;
  /** Code promo saisi dans la fenêtre de commande. */
  promoCode?: string | null;
}): Promise<{
  id: string;
  url: string;
  total: number;
  promo: { id: string; code: string } | null;
}> {
  const course = (await db().doc(`courses/${params.courseId}`).get()).data() as
    CourseDoc | undefined;
  if (!course || course.status !== "published") throw new PaymentError("Formation introuvable.");
  if (!course.price) throw new PaymentError("Cette formation n'est pas en vente.");
  const count = params.installments ?? null;
  if (
    count &&
    (!course.price.installments?.includes(count) ||
      course.price.amount < MIN_INSTALLMENTS_PRICE_CENTS)
  ) {
    throw new PaymentError(`Le paiement en ${count} fois n'est pas proposé pour cette formation.`);
  }
  const stripe = await schoolStripe(course.creatorId, params.client.livemode);
  if (!stripe?.chargesEnabled) {
    throw new PaymentError("Le paiement en ligne n'est pas encore activé pour cette formation.");
  }
  // Code promo : en une fois, appliqué par Stripe ; en plusieurs fois, l'échéancier est
  // calculé sur le prix remisé (si le formateur a ouvert ce code au paiement échelonné).
  let promo: { id: string; code: string; promotionCodeId: string } | null = null;
  let total = course.price.amount;
  if (params.promoCode) {
    const found = await findActivePromo(params.courseId, params.promoCode, stripe.accountId);
    if (count && found.promo.installments === false) {
      throw new PaymentError("Ce code promo n'est valable qu'en paiement en une fois.");
    }
    total = discountedAmount(course.price.amount, found.promo);
    if (total < MIN_PRICE_CENTS)
      throw new PaymentError("Ce code ne peut pas s'appliquer à ce prix.");
    promo = {
      id: found.id,
      code: found.promo.code,
      promotionCodeId: found.promo.stripePromotionCodeId,
    };
  }
  const creator = (await db().doc(`creators/${course.creatorId}`).get()).data() as CreatorDoc;
  const productId = await ensureProduct(params.courseId, course, stripe.accountId, params.client);
  const session = await params.client.createCheckout({
    accountId: stripe.accountId,
    productId,
    price: course.price,
    courseId: params.courseId,
    schoolId: course.creatorId,
    email: params.email,
    successUrl: `${params.appUrl}/merci?session={CHECKOUT_SESSION_ID}&formation=${params.courseId}`,
    cancelUrl: `${params.appUrl}${routes.salesPage(creator.slug, course.slug)}`,
    termsAcceptedAt: params.termsAcceptedAt ?? new Date().toISOString(),
    installments: count ? installmentPlan(total, count) : null,
    total,
    promo,
    stripeInvoice: (await readSalesSettings(course.creatorId)).invoicing === "stripe",
  });
  return { ...session, total, promo: promo ? { id: promo.id, code: promo.code } : null };
}

export interface CompletedCheckout {
  sessionId: string;
  accountId: string;
  courseId: string;
  email: string;
  name: string | null;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
  promoCode: string | null;
  /** Code promo saisi dans la fenêtre de commande (compté ici en paiement échelonné). */
  promoId?: string | null;
  /** Facture Stripe du paiement (mode de facturation « Stripe », ou 1re échéance). */
  stripeInvoiceId?: string | null;
  livemode: boolean;
  termsAcceptedAt?: string | null;
  billingAddress?: string | null;
  /** Paiement en plusieurs fois : abonnement créé par Checkout, première facture réglée. */
  installments?: {
    count: number;
    subscriptionId: string | null;
    customerId: string | null;
    firstInvoiceId: string | null;
  } | null;
}

/**
 * Utilisation d'un code promo en paiement échelonné (Stripe ne la voit pas) : comptée, et le
 * code est désactivé chez Stripe aussi quand il atteint son maximum d'utilisations.
 */
async function countInstallmentRedemption(
  courseId: string,
  promoId: string,
  accountId: string,
  client: PaymentsClient | undefined,
): Promise<void> {
  const ref = db().doc(`courses/${courseId}/promoCodes/${promoId}`);
  const exhausted = await db().runTransaction(async (tx) => {
    const promo = (await tx.get(ref)).data() as PromoCodeDoc | undefined;
    if (!promo) return null;
    const installmentRedemptions = (promo.installmentRedemptions ?? 0) + 1;
    const full = Boolean(
      promo.maxRedemptions && promo.timesRedeemed + installmentRedemptions >= promo.maxRedemptions,
    );
    tx.update(ref, { installmentRedemptions, ...(full ? { active: false } : {}) });
    return full ? promo : null;
  });
  if (exhausted && client) {
    await client
      .deactivatePromo(accountId, exhausted.stripePromotionCodeId)
      .catch((error) => console.error(`Code promo ${promoId}`, error));
  }
}

/** Paiement réussi : commande enregistrée et accès donné (idempotent, les webhooks sont rejoués). */
export async function completeCheckout(
  checkout: CompletedCheckout,
  appUrlFor: (schoolId: string) => Promise<string>,
  client?: PaymentsClient,
): Promise<void> {
  const account = (await db().doc(`stripeAccounts/${checkout.accountId}`).get()).data() as
    { schoolId: string } | undefined;
  if (!account) throw new Error(`Compte Stripe inconnu : ${checkout.accountId}`);
  const courseSnap = await db().doc(`courses/${checkout.courseId}`).get();
  const course = courseSnap.data() as CourseDoc | undefined;
  if (!course || course.creatorId !== account.schoolId) {
    throw new Error(`Formation ${checkout.courseId} hors de l'école ${account.schoolId}`);
  }

  const orderRef = db().doc(`orders/${checkout.sessionId}`);
  const existing = (await orderRef.get()).data() as OrderDoc | undefined;
  // Mode de facturation figé à l'achat (un changement de réglage ne touche pas aux ventes passées).
  const invoicing = existing?.invoicing ?? (await readSalesSettings(account.schoolId)).invoicing;
  const plan = checkout.installments;
  const installments: OrderInstallments | null = plan
    ? {
        ...installmentPlan(checkout.amount, plan.count),
        paidInvoiceIds: plan.firstInvoiceId ? [plan.firstInvoiceId] : [],
        subscriptionId: plan.subscriptionId,
        customerId: plan.customerId,
        status: plan.count > 1 ? "active" : "completed",
      }
    : null;
  const order: OrderDoc<FieldValue> = {
    schoolId: account.schoolId,
    courseId: checkout.courseId,
    courseTitle: course.title,
    email: checkout.email.toLowerCase(),
    name: checkout.name,
    amount: checkout.amount,
    currency: checkout.currency,
    promoCode: checkout.promoCode,
    paymentIntentId: checkout.paymentIntentId,
    status: "paid",
    livemode: checkout.livemode,
    termsAcceptedAt: checkout.termsAcceptedAt ?? null,
    billingAddress: checkout.billingAddress ?? null,
    invoicing,
    // Webhook rejoué : la date d'achat et l'échéancier déjà suivi sont conservés.
    installments: existing?.installments ?? installments,
    createdAt: existing?.createdAt
      ? (existing.createdAt as FieldValue)
      : FieldValue.serverTimestamp(),
  };
  await orderRef.set(order, { merge: true });
  if (!existing && plan && checkout.promoId) {
    await countInstallmentRedemption(
      checkout.courseId,
      checkout.promoId,
      checkout.accountId,
      client,
    ).catch((error) => console.error(`Code promo de la commande ${checkout.sessionId}`, error));
  }
  // La facture ne doit jamais bloquer l'accès : une erreur est journalisée, pas propagée.
  if (invoicing === "platform") {
    await issueInvoice(checkout.sessionId).catch((error) =>
      console.error(`Facture de la commande ${checkout.sessionId}`, error),
    );
  } else if (invoicing === "stripe" && checkout.stripeInvoiceId && client) {
    await addStripeInvoice(orderRef.id, checkout.accountId, checkout.stripeInvoiceId, client).catch(
      (error) => console.error(`Facture Stripe de la commande ${checkout.sessionId}`, error),
    );
  }

  const result = await grantAccessToStudents({
    courseId: checkout.courseId,
    course,
    students: [{ email: order.email, ...(checkout.name ? { name: checkout.name } : {}) }],
    source: "stripe",
    sendEmail: true,
    appUrl: await appUrlFor(account.schoolId),
    orderId: checkout.sessionId,
  });
  if (result.errors.length) throw new Error(result.errors[0].message);
}

/** Lien vers la facture Stripe, ajouté à la commande (une seule fois par facture). */
async function addStripeInvoice(
  orderId: string,
  accountId: string,
  invoiceId: string,
  client: PaymentsClient,
  known?: StripeInvoiceLink,
): Promise<void> {
  const invoice = known ?? (await client.getInvoice(accountId, invoiceId));
  if (!invoice) return;
  const ref = db().doc(`orders/${orderId}`);
  await db().runTransaction(async (tx) => {
    const order = (await tx.get(ref)).data() as OrderDoc | undefined;
    if (!order || order.stripeInvoices?.some((existing) => existing.id === invoice.id)) return;
    tx.update(ref, { stripeInvoices: [...(order.stripeInvoices ?? []), invoice] });
  });
}

async function setOrderAccess(order: OrderDoc, status: "active" | "revoked"): Promise<void> {
  const enrollments = await db()
    .collection("enrollments")
    .where("courseId", "==", order.courseId)
    .where("email", "==", order.email)
    .limit(1)
    .get();
  await enrollments.docs[0]?.ref.update({ status });
}

const revokeOrderAccess = (order: OrderDoc) => setOrderAccess(order, "revoked");

async function orderBySubscription(subscriptionId: string) {
  const snap = await db()
    .collection("orders")
    .where("installments.subscriptionId", "==", subscriptionId)
    .limit(1)
    .get();
  return snap.docs[0] ?? null;
}

/** Notification (dans l'application) à l'équipe de l'école : échéance impayée, arrêt… */
async function notifySchool(
  schoolId: string,
  id: string,
  title: string,
  body: string,
  link: string,
) {
  const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
  const batch = db().batch();
  for (const uid of schoolAdminSet(schoolId, creator)) {
    batch.set(db().doc(`users/${uid}/notifications/${id}`), {
      type: "payment_issue",
      title,
      body,
      link,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
}

/**
 * Échéance réglée (webhook invoice.paid) : comptée une seule fois ; après la dernière,
 * l'abonnement est arrêté. La première échéance est comptée à la création de la commande.
 * Accès suspendu pour impayé : rétabli. Facturation « Stripe » : lien vers la facture ajouté.
 */
export async function recordInstallmentPaid(params: {
  accountId: string;
  subscriptionId: string;
  invoiceId: string;
  client: PaymentsClient;
  /** Facture Stripe déjà connue par le webhook (évite un appel à Stripe). */
  invoice?: StripeInvoiceLink;
}): Promise<OrderInstallments | null> {
  const doc = await orderBySubscription(params.subscriptionId);
  if (!doc) return null;
  const result = await db().runTransaction(async (tx) => {
    const order = (await tx.get(doc.ref)).data() as OrderDoc;
    const current = order.installments;
    if (!current || current.paidInvoiceIds.includes(params.invoiceId)) {
      return { installments: current ?? null, order, restored: false };
    }
    const paidInvoiceIds = [...current.paidInvoiceIds, params.invoiceId];
    const status = paidInvoiceIds.length >= current.count ? "completed" : "active";
    tx.update(doc.ref, {
      "installments.paidInvoiceIds": paidInvoiceIds,
      "installments.status": status,
      "installments.suspended": false,
    });
    return {
      installments: { ...current, paidInvoiceIds, status, suspended: false } as OrderInstallments,
      order,
      restored: Boolean(current.suspended),
    };
  });
  const { installments, order, restored } = result;
  if (restored && order.status === "paid") {
    await setOrderAccess(order, "active");
    await notifySchool(
      order.schoolId,
      `payment_${doc.id}`,
      "Échéance réglée",
      `${order.name || order.email} · ${order.courseTitle ?? "formation"} : paiement reçu, accès rétabli.`,
      routes.adminCourseSales(order.courseId),
    );
  }
  if (order.invoicing === "stripe") {
    await addStripeInvoice(
      doc.id,
      params.accountId,
      params.invoiceId,
      params.client,
      params.invoice,
    ).catch((error) => console.error(`Facture Stripe ${params.invoiceId}`, error));
  }
  if (installments?.status === "completed") {
    await params.client
      .cancelSubscription(params.accountId, params.subscriptionId)
      .catch((error) => console.error(`Abonnement ${params.subscriptionId}`, error));
  }
  return installments;
}

/**
 * Échéance refusée (webhook invoice.payment_failed) : l'école est prévenue, Stripe relance.
 * Selon le réglage de l'école, l'accès est suspendu tout de suite (rétabli au paiement).
 */
export async function recordInstallmentFailed(subscriptionId: string): Promise<void> {
  const doc = await orderBySubscription(subscriptionId);
  const order = doc?.data() as OrderDoc | undefined;
  if (!doc || !order?.installments || order.installments.status === "completed") return;
  const { unpaidPolicy } = await readSalesSettings(order.schoolId);
  const suspend = unpaidPolicy === "immediate" && order.status === "paid";
  await doc.ref.update({
    "installments.status": "past_due",
    ...(suspend ? { "installments.suspended": true } : {}),
  });
  if (suspend) await revokeOrderAccess(order);
  await notifySchool(
    order.schoolId,
    `payment_${doc.id}`,
    "Échéance impayée",
    `${order.name || order.email} · ${order.courseTitle ?? "formation"} : Stripe va relancer le paiement${
      suspend ? " ; accès suspendu jusqu'au paiement." : "."
    }`,
    routes.adminCourseSales(order.courseId),
  );
}

/**
 * Abonnement arrêté (webhook customer.subscription.deleted) avant la dernière échéance, par
 * exemple après plusieurs refus de paiement : l'accès est retiré (sauf si l'école a choisi de
 * ne jamais le retirer) et l'école prévenue.
 */
export async function recordInstallmentsEnded(subscriptionId: string): Promise<void> {
  const doc = await orderBySubscription(subscriptionId);
  const order = doc?.data() as OrderDoc | undefined;
  const installments = order?.installments;
  if (!doc || !order || !installments) return;
  if (installments.paidInvoiceIds.length >= installments.count || order.status === "refunded") {
    return;
  }
  const { unpaidPolicy } = await readSalesSettings(order.schoolId);
  const keep = unpaidPolicy === "never";
  await doc.ref.update({ "installments.status": "canceled" });
  if (!keep) await revokeOrderAccess(order);
  await notifySchool(
    order.schoolId,
    `payment_${doc.id}`,
    "Paiement en plusieurs fois interrompu",
    `${order.name || order.email} · ${order.courseTitle ?? "formation"} : ${installments.paidInvoiceIds.length}/${installments.count} échéances payées, ${
      keep ? "accès conservé (ton réglage)" : "accès retiré"
    }.`,
    routes.adminCourseSales(order.courseId),
  );
}

/**
 * Remboursement total : la commande est marquée remboursée et l'accès retiré. Paiement en
 * plusieurs fois : la commande est retrouvée par le client Stripe, l'abonnement est arrêté.
 */
export async function refundOrder(
  paymentIntentId: string | null,
  installments?: { customerId: string | null; accountId: string; client: PaymentsClient },
): Promise<void> {
  const orders = paymentIntentId
    ? await db().collection("orders").where("paymentIntentId", "==", paymentIntentId).limit(1).get()
    : null;
  let orderDoc = orders?.docs[0];
  if (!orderDoc && installments?.customerId) {
    const byCustomer = await db()
      .collection("orders")
      .where("installments.customerId", "==", installments.customerId)
      .limit(1)
      .get();
    orderDoc = byCustomer.docs[0];
  }
  if (!orderDoc) return;
  const order = orderDoc.data() as OrderDoc<Timestamp>;
  if (order.status === "refunded") return;
  await orderDoc.ref.update({ status: "refunded" });
  const subscriptionId = order.installments?.subscriptionId;
  if (installments && subscriptionId && order.installments?.status !== "completed") {
    await installments.client
      .cancelSubscription(installments.accountId, subscriptionId)
      .catch((error) => console.error(`Abonnement ${subscriptionId}`, error));
  }
  await issueCreditNote(orderDoc.id).catch((error) =>
    console.error(`Avoir de la commande ${orderDoc.id}`, error),
  );
  await revokeOrderAccess(order);
}

/** Code promo sur la formation (compte Stripe de l'école), avec son miroir Firestore. */
export async function createPromoCode(
  input: PromoCodeInput,
  client: PaymentsClient,
): Promise<string> {
  const course = (await db().doc(`courses/${input.courseId}`).get()).data() as
    CourseDoc | undefined;
  if (!course) throw new PaymentError("Formation introuvable.");
  const stripe = await schoolStripe(course.creatorId, client.livemode);
  if (!stripe?.chargesEnabled) throw new PaymentError("Relie d'abord ton compte Stripe.");
  const existing = await db()
    .collection(`courses/${input.courseId}/promoCodes`)
    .where("code", "==", input.code)
    .where("active", "==", true)
    .limit(1)
    .get();
  if (!existing.empty) throw new PaymentError("Ce code existe déjà pour cette formation.");
  const productId = await ensureProduct(input.courseId, course, stripe.accountId, client);
  const created = await client.createPromo(stripe.accountId, { ...input, productId });
  const ref = await db()
    .collection(`courses/${input.courseId}/promoCodes`)
    .add({
      code: input.code,
      kind: input.kind,
      value: input.value,
      maxRedemptions: input.maxRedemptions ?? null,
      expiresAt: input.expiresAt ? Timestamp.fromMillis(Date.parse(input.expiresAt)) : null,
      active: true,
      timesRedeemed: 0,
      installments: input.installments ?? true,
      installmentRedemptions: 0,
      stripePromotionCodeId: created.promotionCodeId,
      stripeCouponId: created.couponId,
      stripeAccountId: stripe.accountId,
      createdAt: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

/** Met à jour le nombre d'utilisations des codes actifs (lu chez Stripe). */
export async function syncPromoCodes(courseId: string, client: PaymentsClient): Promise<void> {
  const course = (await db().doc(`courses/${courseId}`).get()).data() as CourseDoc | undefined;
  if (!course) return;
  const stripe = await schoolStripe(course.creatorId, client.livemode);
  if (!stripe) return;
  const promos = await db()
    .collection(`courses/${courseId}/promoCodes`)
    .where("active", "==", true)
    .get();
  const current = promos.docs.filter((promo) => {
    const accountId = (promo.data() as PromoCodeDoc).stripeAccountId;
    return !accountId || accountId === stripe.accountId;
  });
  await Promise.all(
    current.map(async (promo) => {
      const timesRedeemed = await client.promoRedemptions(
        stripe.accountId,
        promo.data().stripePromotionCodeId,
      );
      if (timesRedeemed !== promo.data().timesRedeemed) await promo.ref.update({ timesRedeemed });
    }),
  );
}

export async function deactivatePromoCode(
  courseId: string,
  promoId: string,
  client: PaymentsClient,
): Promise<void> {
  const course = (await db().doc(`courses/${courseId}`).get()).data() as CourseDoc | undefined;
  const ref = db().doc(`courses/${courseId}/promoCodes/${promoId}`);
  const promo = (await ref.get()).data() as PromoCodeDoc | undefined;
  if (!course || !promo) throw new PaymentError("Code promo introuvable.");
  const stripe = await schoolStripe(course.creatorId, client.livemode);
  // Code d'un ancien compte (autre mode) : il n'existe plus chez Stripe, on le désactive ici.
  const sameAccount = !promo.stripeAccountId || promo.stripeAccountId === stripe?.accountId;
  if (stripe && sameAccount) {
    await client.deactivatePromo(stripe.accountId, promo.stripePromotionCodeId);
  }
  await ref.update({ active: false });
}

/**
 * Stripe simulé (émulateurs, STRIPE_FAKE=true) : compte actif dès la connexion, paiement
 * validé immédiatement par la callable (voir createCheckoutSession).
 */
let fakeCounter = 0;
export function fakePaymentsClient(livemode = false): PaymentsClient {
  const id = (prefix: string) => `${prefix}_demo_${Date.now()}_${++fakeCounter}`;
  return {
    livemode,
    async createAccount() {
      return id("acct");
    },
    async accountLink(_accountId, returnUrl) {
      // Adresse relative : le navigateur reste sur le serveur local, quel que soit son port.
      const url = new URL(returnUrl);
      return `${url.pathname}${url.search}`;
    },
    async getAccount() {
      return { chargesEnabled: true, detailsSubmitted: true };
    },
    async createProduct() {
      return id("prod");
    },
    async createCheckout(request) {
      const sessionId = id("cs");
      return { id: sessionId, url: `/merci?session=${sessionId}&formation=${request.courseId}` };
    },
    async createPromo() {
      return { promotionCodeId: id("promo"), couponId: id("coupon") };
    },
    async promoRedemptions() {
      return 0;
    },
    async deactivatePromo() {},
    async cancelSubscription() {},
    async getInvoice(_accountId, invoiceId) {
      return { id: invoiceId, number: `DEMO-${invoiceId.slice(-4)}`, url: null, amount: 0 };
    },
  };
}
