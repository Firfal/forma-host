import { FieldValue, Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import type { CoursePrice, OrderDoc, PromoCodeInput, SchoolStripeDoc } from "@shared/payments";
import { routes } from "@shared/paths";
import type { CourseDoc, CreatorDoc } from "@shared/types";
import { grantAccessToStudents } from "./access";
import { db } from "./db";

/**
 * Paiements Stripe Connect : chaque école relie son propre compte Stripe (compte « Standard »,
 * frais Stripe à sa charge, 0 % de commission pour la plateforme). Les sessions Checkout et
 * les codes promo sont créés sur le compte de l'école ; le webhook Connect donne l'accès.
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
}

export interface PaymentsClient {
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
}

/** Client Stripe réel (clé secrète de la plateforme, requêtes sur le compte de l'école). */
export function stripeClient(secretKey: string): PaymentsClient {
  const stripe = new Stripe(secretKey);
  return {
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
      const session = await stripe.checkout.sessions.create(
        {
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
          allow_promotion_codes: true,
          ...(request.email ? { customer_email: request.email } : {}),
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          metadata: { courseId: request.courseId, schoolId: request.schoolId },
          locale: "fr",
        },
        { stripeAccount: request.accountId },
      );
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

async function schoolStripe(schoolId: string): Promise<SchoolStripeDoc | null> {
  const snap = await db().doc(`creators/${schoolId}/private/stripe`).get();
  return (snap.data() as SchoolStripeDoc | undefined) ?? null;
}

/** Lien d'onboarding Stripe (compte créé au premier appel). */
export async function connectStripe(params: {
  schoolId: string;
  email: string;
  appUrl: string;
  client: PaymentsClient;
}): Promise<string> {
  const { schoolId, client } = params;
  let stripe = await schoolStripe(schoolId);
  if (!stripe) {
    const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
    if (!creator) throw new PaymentError("École introuvable.");
    const accountId = await client.createAccount({
      email: params.email,
      schoolName: creator.name,
      schoolId,
    });
    stripe = { accountId, chargesEnabled: false, detailsSubmitted: false, updatedAt: null };
    const batch = db().batch();
    batch.set(db().doc(`creators/${schoolId}/private/stripe`), {
      ...stripe,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db().doc(`stripeAccounts/${accountId}`), { schoolId });
    await batch.commit();
  }
  const back = `${params.appUrl}${routes.adminSettings}`;
  return client.accountLink(stripe.accountId, `${back}?stripe=retour`, `${back}?stripe=relance`);
}

/** Relit l'état du compte Stripe (retour d'onboarding, webhook account.updated). */
export async function refreshStripeAccount(
  schoolId: string,
  client: PaymentsClient,
): Promise<SchoolStripeDoc | null> {
  const stripe = await schoolStripe(schoolId);
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

/** Session de paiement pour une formation publiée, avec prix et compte Stripe actif. */
export async function createCheckout(params: {
  courseId: string;
  email: string | null;
  appUrl: string;
  client: PaymentsClient;
}): Promise<{ id: string; url: string }> {
  const course = (await db().doc(`courses/${params.courseId}`).get()).data() as
    CourseDoc | undefined;
  if (!course || course.status !== "published") throw new PaymentError("Formation introuvable.");
  if (!course.price) throw new PaymentError("Cette formation n'est pas en vente.");
  const stripe = await schoolStripe(course.creatorId);
  if (!stripe?.chargesEnabled) {
    throw new PaymentError("Le paiement en ligne n'est pas encore activé pour cette formation.");
  }
  const creator = (await db().doc(`creators/${course.creatorId}`).get()).data() as CreatorDoc;
  const productId = await ensureProduct(params.courseId, course, stripe.accountId, params.client);
  return params.client.createCheckout({
    accountId: stripe.accountId,
    productId,
    price: course.price,
    courseId: params.courseId,
    schoolId: course.creatorId,
    email: params.email,
    successUrl: `${params.appUrl}/merci?session={CHECKOUT_SESSION_ID}&formation=${params.courseId}`,
    cancelUrl: `${params.appUrl}${routes.salesPage(creator.slug, course.slug)}`,
  });
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
}

/** Paiement réussi : commande enregistrée et accès donné (idempotent, les webhooks sont rejoués). */
export async function completeCheckout(
  checkout: CompletedCheckout,
  appUrlFor: (schoolId: string) => Promise<string>,
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
  const order: OrderDoc<FieldValue> = {
    schoolId: account.schoolId,
    courseId: checkout.courseId,
    email: checkout.email.toLowerCase(),
    name: checkout.name,
    amount: checkout.amount,
    currency: checkout.currency,
    promoCode: checkout.promoCode,
    paymentIntentId: checkout.paymentIntentId,
    status: "paid",
    createdAt: FieldValue.serverTimestamp(),
  };
  await orderRef.set(order, { merge: true });

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

/** Remboursement total : la commande est marquée remboursée et l'accès retiré. */
export async function refundOrder(paymentIntentId: string): Promise<void> {
  const orders = await db()
    .collection("orders")
    .where("paymentIntentId", "==", paymentIntentId)
    .limit(1)
    .get();
  const orderDoc = orders.docs[0];
  if (!orderDoc) return;
  const order = orderDoc.data() as OrderDoc<Timestamp>;
  await orderDoc.ref.update({ status: "refunded" });
  const enrollments = await db()
    .collection("enrollments")
    .where("courseId", "==", order.courseId)
    .where("email", "==", order.email)
    .limit(1)
    .get();
  await enrollments.docs[0]?.ref.update({ status: "revoked" });
}

/** Code promo sur la formation (compte Stripe de l'école), avec son miroir Firestore. */
export async function createPromoCode(
  input: PromoCodeInput,
  client: PaymentsClient,
): Promise<string> {
  const course = (await db().doc(`courses/${input.courseId}`).get()).data() as
    CourseDoc | undefined;
  if (!course) throw new PaymentError("Formation introuvable.");
  const stripe = await schoolStripe(course.creatorId);
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
      stripePromotionCodeId: created.promotionCodeId,
      stripeCouponId: created.couponId,
      createdAt: FieldValue.serverTimestamp(),
    });
  return ref.id;
}

/** Met à jour le nombre d'utilisations des codes actifs (lu chez Stripe). */
export async function syncPromoCodes(courseId: string, client: PaymentsClient): Promise<void> {
  const course = (await db().doc(`courses/${courseId}`).get()).data() as CourseDoc | undefined;
  if (!course) return;
  const stripe = await schoolStripe(course.creatorId);
  if (!stripe) return;
  const promos = await db()
    .collection(`courses/${courseId}/promoCodes`)
    .where("active", "==", true)
    .get();
  await Promise.all(
    promos.docs.map(async (promo) => {
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
  const promo = (await ref.get()).data() as { stripePromotionCodeId: string } | undefined;
  if (!course || !promo) throw new PaymentError("Code promo introuvable.");
  const stripe = await schoolStripe(course.creatorId);
  if (stripe) await client.deactivatePromo(stripe.accountId, promo.stripePromotionCodeId);
  await ref.update({ active: false });
}

/**
 * Stripe simulé (émulateurs, STRIPE_FAKE=true) : compte actif dès la connexion, paiement
 * validé immédiatement par la callable (voir createCheckoutSession).
 */
let fakeCounter = 0;
export function fakePaymentsClient(): PaymentsClient {
  const id = (prefix: string) => `${prefix}_demo_${Date.now()}_${++fakeCounter}`;
  return {
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
  };
}
