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
  refreshStripeAccount,
  refundOrder,
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
