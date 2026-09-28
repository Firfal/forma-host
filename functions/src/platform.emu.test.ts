import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { platformOverview } from "./platform";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  const created = Timestamp.fromDate(new Date("2026-01-15T10:00:00Z"));
  await db().doc("platform/settings").set({ paymentsEnabled: true, stripeLivemode: false });
  await db()
    .doc("creators/theo")
    .set({
      name: "Ecole Motion",
      slug: "ecole-motion",
      createdAt: created,
      customDomain: { host: "app.ecolemotion.com", status: "active" },
    });
  await db().doc("creators/theo/private/stripe").set({ livemode: false, chargesEnabled: true });
  await db()
    .doc("creators/lea")
    .set({ name: "Atelier Léa", slug: "atelier-lea", createdAt: created });
  await db().doc("courses/c1").set({ creatorId: "theo", status: "published" });
  await db().doc("courses/c2").set({ creatorId: "theo", status: "draft" });
  await db().doc("courses/c3").set({ creatorId: "lea", status: "published" });
  for (const [id, creatorId, status] of [
    ["c1_a", "theo", "active"],
    ["c1_b", "theo", "active"],
    ["c1_c", "theo", "revoked"],
    ["c3_a", "lea", "active"],
  ]) {
    await db().doc(`enrollments/${id}`).set({ creatorId, status });
  }
  await db()
    .doc("orders/o1")
    .set({ schoolId: "theo", status: "paid", amount: 19900, livemode: false });
  await db().doc("orders/o2").set({ schoolId: "theo", status: "paid", amount: 9900 });
  await db()
    .doc("orders/o3")
    .set({ schoolId: "theo", status: "refunded", amount: 5000, livemode: false });
  await db()
    .doc("orders/o4")
    .set({ schoolId: "theo", status: "paid", amount: 50000, livemode: true });
  await db().doc("creatorRequests/x").set({ status: "pending" });
  await db().doc("creatorRequests/y").set({ status: "approved" });
});

describe("vue d'ensemble de la plateforme", () => {
  it("compte écoles, formations, inscriptions et ventes du mode Stripe en cours", async () => {
    const overview = await platformOverview();
    expect(overview).toMatchObject({
      livemode: false,
      pendingRequests: 1,
      totals: { schools: 2, publishedCourses: 2, enrollments: 3, sales: 2, revenueCents: 29800 },
    });
    expect(overview.schools[0]).toEqual({
      id: "theo",
      name: "Ecole Motion",
      slug: "ecole-motion",
      createdAt: "2026-01-15T10:00:00.000Z",
      domain: "app.ecolemotion.com",
      domainActive: true,
      stripe: "active",
      courses: 2,
      publishedCourses: 1,
      enrollments: 2,
      sales: 2,
      revenueCents: 29800,
    });
    expect(overview.schools[1]).toMatchObject({ id: "lea", stripe: "none", domain: null });
  });
});
