import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth, db } from "./db";
import { issueMissingInvoices } from "./invoices";
import {
  completeCheckout,
  connectStripe,
  createCheckout,
  createPromoCode,
  deactivatePromoCode,
  fakePaymentsClient,
  recordInstallmentFailed,
  recordInstallmentPaid,
  recordInstallmentsEnded,
  refreshStripeAccount,
  refundOrder,
  type CheckoutRequest,
  type PaymentsClient,
} from "./payments";

const PROJECT = "demo-forma";
const APP_URL = "https://app.test";
const client = fakePaymentsClient();
const appUrlFor = async () => APP_URL;

async function clear() {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`,
    { method: "DELETE" },
  );
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

beforeEach(async () => {
  await clear();
  await db()
    .doc("creators/theo")
    .set({ name: "Ecole Motion", slug: "ecole-motion", adminUids: ["theo"] });
  await db()
    .doc("courses/c1")
    .set({
      creatorId: "theo",
      title: "After Effects",
      slug: "after-effects",
      status: "published",
      items: [],
      price: { amount: 19700, currency: "eur" },
    });
});

async function connectedAccount(): Promise<string> {
  const url = await connectStripe({
    schoolId: "theo",
    email: "theo@test.fr",
    appUrl: APP_URL,
    client,
  });
  expect(url).toContain("/admin/parametres?stripe=retour");
  await refreshStripeAccount("theo", client);
  const stripe = (await db().doc("creators/theo/private/stripe").get()).data();
  expect(stripe).toMatchObject({ chargesEnabled: true });
  expect((await db().doc(`stripeAccounts/${stripe?.accountId}`).get()).data()).toEqual({
    schoolId: "theo",
  });
  return stripe?.accountId;
}

describe("paiements Stripe", () => {
  it("pas de paiement sans compte Stripe actif ni prix", async () => {
    await expect(
      createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client }),
    ).rejects.toThrow("pas encore activé");
    await connectedAccount();
    await db().doc("courses/c1").update({ price: null });
    await expect(
      createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client }),
    ).rejects.toThrow("pas en vente");
  });

  it("paiement réussi : commande et accès (idempotent), remboursement : accès retiré", async () => {
    const accountId = await connectedAccount();
    const session = await createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client });
    expect(session.url).toContain("/merci?session=");
    expect((await db().doc("courses/c1/private/stripe").get()).data()?.accountId).toBe(accountId);

    const checkout = {
      sessionId: session.id,
      accountId,
      courseId: "c1",
      email: "Lea@Test.fr",
      name: "Léa",
      amount: 15760,
      currency: "eur",
      paymentIntentId: "pi_123",
      promoCode: null,
      livemode: false,
    };
    await completeCheckout(checkout, appUrlFor);
    await completeCheckout(checkout, appUrlFor);

    const lea = await auth().getUserByEmail("lea@test.fr");
    const enrollment = (await db().doc(`enrollments/c1_${lea.uid}`).get()).data();
    expect(enrollment).toMatchObject({ status: "active", source: "stripe", orderId: session.id });
    expect((await db().doc(`orders/${session.id}`).get()).data()).toMatchObject({
      schoolId: "theo",
      email: "lea@test.fr",
      amount: 15760,
      status: "paid",
      livemode: false,
    });
    const mails = await db().collection("mail").where("to", "==", "lea@test.fr").get();
    expect(mails.size).toBe(1);

    await refundOrder("pi_123");
    expect((await db().doc(`orders/${session.id}`).get()).data()?.status).toBe("refunded");
    expect((await db().doc(`enrollments/c1_${lea.uid}`).get()).data()?.status).toBe("revoked");
  });

  it("refuse un paiement d'un compte Stripe qui n'est pas celui de l'école", async () => {
    await connectedAccount();
    await expect(
      completeCheckout(
        {
          sessionId: "cs_x",
          accountId: "acct_inconnu",
          courseId: "c1",
          email: "x@test.fr",
          name: null,
          amount: 100,
          currency: "eur",
          paymentIntentId: null,
          promoCode: null,
          livemode: false,
        },
        appUrlFor,
      ),
    ).rejects.toThrow("inconnu");
  });

  it("codes promo : création, doublon refusé, désactivation", async () => {
    await expect(
      createPromoCode({ courseId: "c1", code: "BIENVENUE", kind: "percent", value: 20 }, client),
    ).rejects.toThrow("Relie d'abord");
    await connectedAccount();
    const id = await createPromoCode(
      { courseId: "c1", code: "BIENVENUE", kind: "percent", value: 20, maxRedemptions: 50 },
      client,
    );
    expect((await db().doc(`courses/c1/promoCodes/${id}`).get()).data()).toMatchObject({
      code: "BIENVENUE",
      active: true,
      maxRedemptions: 50,
    });
    await expect(
      createPromoCode({ courseId: "c1", code: "BIENVENUE", kind: "amount", value: 5000 }, client),
    ).rejects.toThrow("existe déjà");
    await deactivatePromoCode("c1", id, client);
    expect((await db().doc(`courses/c1/promoCodes/${id}`).get()).data()?.active).toBe(false);
  });

  it("passage du mode test au réel : compte, produit et codes promo de test mis de côté", async () => {
    const testAccount = await connectedAccount();
    await createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client });
    const promoId = await createPromoCode(
      { courseId: "c1", code: "TEST20", kind: "percent", value: 20 },
      client,
    );
    expect((await db().doc("creators/theo/private/stripe").get()).data()?.livemode).toBe(false);

    // Clé réelle : le compte de test est ignoré, l'école doit reconnecter Stripe.
    const live = fakePaymentsClient(true);
    await expect(
      createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client: live }),
    ).rejects.toThrow("pas encore activé");
    expect(await refreshStripeAccount("theo", live)).toBeNull();

    await connectStripe({ schoolId: "theo", email: "theo@test.fr", appUrl: APP_URL, client: live });
    await refreshStripeAccount("theo", live);
    const stripe = (await db().doc("creators/theo/private/stripe").get()).data();
    expect(stripe).toMatchObject({ livemode: true, chargesEnabled: true });
    expect(stripe?.accountId).not.toBe(testAccount);
    // Le code promo de test n'existe pas sur le compte réel : désactivé, il peut être recréé.
    expect((await db().doc(`courses/c1/promoCodes/${promoId}`).get()).data()?.active).toBe(false);
    await createPromoCode({ courseId: "c1", code: "TEST20", kind: "percent", value: 20 }, live);

    // Nouveau produit Stripe, sur le compte réel.
    await createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client: live });
    expect((await db().doc("courses/c1/private/stripe").get()).data()?.accountId).toBe(
      stripe?.accountId,
    );
  });
});

describe("factures", () => {
  const legal = {
    companyName: "Ecole Motion",
    legalForm: "SAS",
    siret: "12345678900012",
    address: "1 rue de la Paix, 75002 Paris",
    vatMode: "standard",
    vatNumber: "FR12345678901",
    publisherName: "Théo Robert",
    contactEmail: "contact@ecolemotion.com",
    phone: null,
    mediatorName: "CM2C",
    mediatorUrl: null,
    refundDays: 0,
    accessMonths: null,
    extraTerms: null,
  };
  const year = new Date().getFullYear();

  async function buy(accountId: string, suffix: string, livemode = false) {
    const session = await createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client });
    await completeCheckout(
      {
        sessionId: session.id,
        accountId,
        courseId: "c1",
        email: `eleve-${suffix}@test.fr`,
        name: `Élève ${suffix}`,
        amount: 19700,
        currency: "eur",
        paymentIntentId: `pi_${suffix}`,
        promoCode: null,
        livemode,
        billingAddress: "1 rue A, 75002 Paris",
      },
      appUrlFor,
    );
    return session.id;
  }
  const invoiceOf = async (orderId: string) =>
    (await db().doc(`orders/${orderId}`).get()).data()?.invoice;

  it("facturation par Stripe (réglage) : facture Stripe demandée et liée, aucune facture Forma Host", async () => {
    const checkouts: CheckoutRequest[] = [];
    const spy: PaymentsClient = {
      ...client,
      async createCheckout(request) {
        checkouts.push(request);
        return client.createCheckout(request);
      },
    };
    const accountId = await connectedAccount();
    await db().doc("creators/theo/legal/info").set(legal);
    await db().doc("creators/theo/private/sales").set({ unpaidPolicy: "end", invoicing: "stripe" });
    const session = await createCheckout({
      courseId: "c1",
      email: null,
      appUrl: APP_URL,
      client: spy,
    });
    expect(checkouts.at(-1)?.stripeInvoice).toBe(true);
    const checkout = {
      sessionId: session.id,
      accountId,
      courseId: "c1",
      email: "eleve@test.fr",
      name: "Élève",
      amount: 19700,
      currency: "eur",
      paymentIntentId: "pi_stripe",
      promoCode: null,
      livemode: false,
      stripeInvoiceId: "in_s1",
    };
    await completeCheckout(checkout, appUrlFor, spy);
    await completeCheckout(checkout, appUrlFor, spy);
    const order = (await db().doc(`orders/${session.id}`).get()).data();
    expect(order?.invoicing).toBe("stripe");
    expect(order?.invoice).toBeUndefined();
    // Rejoué : une seule fois.
    expect(order?.stripeInvoices).toEqual([expect.objectContaining({ id: "in_s1" })]);
    expect(await issueMissingInvoices("theo")).toBe(0);
  });

  it("facturation par l'outil du formateur (réglage) : aucune facture établie ici", async () => {
    const accountId = await connectedAccount();
    await db().doc("creators/theo/legal/info").set(legal);
    await db()
      .doc("creators/theo/private/sales")
      .set({ unpaidPolicy: "end", invoicing: "external" });
    const orderId = await buy(accountId, "outil");
    const order = (await db().doc(`orders/${orderId}`).get()).data();
    expect(order).toMatchObject({ invoicing: "external" });
    expect(order?.invoice).toBeUndefined();
    expect(order?.stripeInvoices).toBeUndefined();
    expect(await issueMissingInvoices("theo")).toBe(0);
  });

  it("émise au paiement, numérotée sans trou, rejouable, avec avoir au remboursement", async () => {
    const accountId = await connectedAccount();
    await db().doc("creators/theo/legal/info").set(legal);
    const first = await buy(accountId, "1");
    const second = await buy(accountId, "2");
    // Webhook rejoué : même facture.
    await completeCheckout(
      {
        sessionId: first,
        accountId,
        courseId: "c1",
        email: "eleve-1@test.fr",
        name: "Élève 1",
        amount: 19700,
        currency: "eur",
        paymentIntentId: "pi_1",
        promoCode: null,
        livemode: false,
      },
      appUrlFor,
    );
    expect(await invoiceOf(first)).toMatchObject({
      number: `TEST-F-${year}-0001`,
      seller: { companyName: "Ecole Motion", siret: "12345678900012" },
      buyer: { name: "Élève 1", email: "eleve-1@test.fr", address: "1 rue A, 75002 Paris" },
      description: "Formation en ligne : After Effects",
      vatRate: 20,
      amountExclTax: 16417,
      vatAmount: 3283,
      amountInclTax: 19700,
    });
    expect((await invoiceOf(second)).number).toBe(`TEST-F-${year}-0002`);
    expect((await db().doc(`orders/${first}`).get()).data()?.courseTitle).toBe("After Effects");

    await refundOrder("pi_2");
    await refundOrder("pi_2");
    expect((await invoiceOf(second)).creditNote.number).toBe(`TEST-A-${year}-0001`);

    // Vente réelle : série distincte de celle des tests.
    const live = await buy(accountId, "3", true);
    expect((await invoiceOf(live)).number).toBe(`F-${year}-0001`);
  });

  it("sans informations légales : pas de facture, puis émission des factures manquantes", async () => {
    const accountId = await connectedAccount();
    const first = await buy(accountId, "a");
    const second = await buy(accountId, "b");
    expect(await invoiceOf(first)).toBeUndefined();
    expect(
      (
        await db()
          .doc(`enrollments/c1_${(await auth().getUserByEmail("eleve-a@test.fr")).uid}`)
          .get()
      ).data()?.status,
    ).toBe("active");

    await db().doc("creators/theo/legal/info").set(legal);
    expect(await issueMissingInvoices("theo")).toBe(2);
    expect(await issueMissingInvoices("theo")).toBe(0);
    expect((await invoiceOf(first)).number).toBe(`TEST-F-${year}-0001`);
    expect((await invoiceOf(second)).number).toBe(`TEST-F-${year}-0002`);
  });
});

describe("paiement en plusieurs fois", () => {
  function spyClient() {
    const canceled: string[] = [];
    const checkouts: CheckoutRequest[] = [];
    const base = fakePaymentsClient();
    const spy: PaymentsClient = {
      ...base,
      async createCheckout(request) {
        checkouts.push(request);
        return base.createCheckout(request);
      },
      async cancelSubscription(_accountId, subscriptionId) {
        canceled.push(subscriptionId);
      },
    };
    return { spy, canceled, checkouts };
  }

  async function buyInThree(accountId: string) {
    await completeCheckout(
      {
        sessionId: "cs_3x",
        accountId,
        courseId: "c1",
        email: "lea@test.fr",
        name: "Léa",
        amount: 19700,
        currency: "eur",
        paymentIntentId: null,
        promoCode: null,
        livemode: false,
        installments: {
          count: 3,
          subscriptionId: "sub_1",
          customerId: "cus_1",
          firstInvoiceId: "in_1",
        },
      },
      appUrlFor,
    );
    const lea = await auth().getUserByEmail("lea@test.fr");
    return {
      order: async () => (await db().doc("orders/cs_3x").get()).data(),
      enrollment: async () => (await db().doc(`enrollments/c1_${lea.uid}`).get()).data(),
    };
  }

  it("proposé seulement si la formation l'autorise ; échéancier transmis à Stripe", async () => {
    const { spy, checkouts } = spyClient();
    await connectedAccount();
    await expect(
      createCheckout({
        courseId: "c1",
        email: null,
        appUrl: APP_URL,
        client: spy,
        installments: 3,
      }),
    ).rejects.toThrow("pas proposé");
    await db()
      .doc("courses/c1")
      .update({ price: { amount: 19700, currency: "eur", installments: [3] } });
    await createCheckout({
      courseId: "c1",
      email: null,
      appUrl: APP_URL,
      client: spy,
      installments: 3,
    });
    expect(checkouts.at(-1)?.installments).toEqual({ count: 3, first: 6568, monthly: 6566 });
    await createCheckout({ courseId: "c1", email: null, appUrl: APP_URL, client: spy });
    expect(checkouts.at(-1)?.installments).toBeNull();
  });

  it("accès au 1er paiement, échéances comptées une fois, abonnement arrêté après la dernière", async () => {
    const { spy, canceled } = spyClient();
    const accountId = await connectedAccount();
    const { order, enrollment } = await buyInThree(accountId);
    expect(await order()).toMatchObject({
      amount: 19700,
      installments: {
        count: 3,
        first: 6568,
        monthly: 6566,
        paidInvoiceIds: ["in_1"],
        status: "active",
      },
    });
    expect((await enrollment())?.status).toBe("active");

    // Premier invoice.paid (déjà compté à la commande), puis deuxième, rejoué.
    const paid = (invoiceId: string) =>
      recordInstallmentPaid({ accountId, subscriptionId: "sub_1", invoiceId, client: spy });
    await paid("in_1");
    await paid("in_2");
    await paid("in_2");
    expect((await order())?.installments.paidInvoiceIds).toEqual(["in_1", "in_2"]);
    expect(canceled).toEqual([]);
    await paid("in_3");
    expect((await order())?.installments).toMatchObject({ status: "completed" });
    expect(canceled).toEqual(["sub_1"]);

    // Abonnement arrêté par nous après la dernière échéance : l'accès reste.
    await recordInstallmentsEnded("sub_1");
    expect((await enrollment())?.status).toBe("active");
  });

  it("échéance refusée : école prévenue ; abonnement arrêté avant la fin : accès retiré", async () => {
    const accountId = await connectedAccount();
    const { order, enrollment } = await buyInThree(accountId);
    await recordInstallmentFailed("sub_1");
    expect((await order())?.installments.status).toBe("past_due");
    const notification = (await db().doc("users/theo/notifications/payment_cs_3x").get()).data();
    expect(notification).toMatchObject({ type: "payment_issue", title: "Échéance impayée" });

    await recordInstallmentsEnded("sub_1");
    expect((await order())?.installments.status).toBe("canceled");
    expect((await enrollment())?.status).toBe("revoked");
  });

  it("impayé, suspension immédiate (réglage) : accès retiré puis rétabli au paiement", async () => {
    const { spy } = spyClient();
    const accountId = await connectedAccount();
    await db()
      .doc("creators/theo/private/sales")
      .set({ unpaidPolicy: "immediate", invoicing: "platform" });
    const { order, enrollment } = await buyInThree(accountId);
    await recordInstallmentFailed("sub_1");
    expect((await order())?.installments).toMatchObject({ status: "past_due", suspended: true });
    expect((await enrollment())?.status).toBe("revoked");
    await recordInstallmentPaid({
      accountId,
      subscriptionId: "sub_1",
      invoiceId: "in_2",
      client: spy,
    });
    expect((await order())?.installments).toMatchObject({ status: "active", suspended: false });
    expect((await enrollment())?.status).toBe("active");
    const notification = (await db().doc("users/theo/notifications/payment_cs_3x").get()).data();
    expect(notification).toMatchObject({ title: "Échéance réglée" });
  });

  it("impayé, accès jamais retiré (réglage) : conservé même si Stripe arrête", async () => {
    const accountId = await connectedAccount();
    await db()
      .doc("creators/theo/private/sales")
      .set({ unpaidPolicy: "never", invoicing: "platform" });
    const { order, enrollment } = await buyInThree(accountId);
    await recordInstallmentFailed("sub_1");
    expect((await enrollment())?.status).toBe("active");
    await recordInstallmentsEnded("sub_1");
    expect((await order())?.installments.status).toBe("canceled");
    expect((await enrollment())?.status).toBe("active");
  });

  it("code promo en plusieurs fois : échéancier remisé, utilisation comptée, code épuisé désactivé", async () => {
    const { spy, checkouts } = spyClient();
    const accountId = await connectedAccount();
    await db()
      .doc("courses/c1")
      .update({ price: { amount: 19700, currency: "eur", installments: [3] } });
    const promoId = await createPromoCode(
      { courseId: "c1", code: "BIENVENUE", kind: "percent", value: 20, maxRedemptions: 1 },
      spy,
    );
    await createPromoCode(
      { courseId: "c1", code: "UNEFOIS", kind: "amount", value: 2000, installments: false },
      spy,
    );
    const session = await createCheckout({
      courseId: "c1",
      email: null,
      appUrl: APP_URL,
      client: spy,
      installments: 3,
      promoCode: "bienvenue",
    });
    expect(session.total).toBe(15760);
    expect(checkouts.at(-1)).toMatchObject({
      total: 15760,
      installments: { count: 3, first: 5254, monthly: 5253 },
      promo: { code: "BIENVENUE" },
    });
    await expect(
      createCheckout({
        courseId: "c1",
        email: null,
        appUrl: APP_URL,
        client: spy,
        installments: 3,
        promoCode: "UNEFOIS",
      }),
    ).rejects.toThrow("qu'en paiement en une fois");

    const checkout = {
      sessionId: "cs_promo",
      accountId,
      courseId: "c1",
      email: "lea@test.fr",
      name: "Léa",
      amount: 15760,
      currency: "eur",
      paymentIntentId: null,
      promoCode: "BIENVENUE",
      promoId,
      livemode: false,
      installments: {
        count: 3,
        subscriptionId: "sub_p",
        customerId: "cus_p",
        firstInvoiceId: "in_p1",
      },
    };
    await completeCheckout(checkout, appUrlFor, spy);
    await completeCheckout(checkout, appUrlFor, spy);
    const promo = (await db().doc(`courses/c1/promoCodes/${promoId}`).get()).data();
    expect(promo).toMatchObject({ installmentRedemptions: 1, active: false });
    expect((await db().doc("orders/cs_promo").get()).data()).toMatchObject({
      amount: 15760,
      promoCode: "BIENVENUE",
      installments: { first: 5254, monthly: 5253 },
    });
    await expect(
      createCheckout({
        courseId: "c1",
        email: null,
        appUrl: APP_URL,
        client: spy,
        installments: 3,
        promoCode: "BIENVENUE",
      }),
    ).rejects.toThrow("invalide ou expiré");
  });

  it("remboursement retrouvé par le client Stripe : accès retiré, abonnement arrêté", async () => {
    const { spy, canceled } = spyClient();
    const accountId = await connectedAccount();
    const { order, enrollment } = await buyInThree(accountId);
    await refundOrder("pi_inconnu", { customerId: "cus_1", accountId, client: spy });
    expect((await order())?.status).toBe("refunded");
    expect((await enrollment())?.status).toBe("revoked");
    expect(canceled).toEqual(["sub_1"]);
  });
});
