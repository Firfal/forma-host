import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatorRequestDoc } from "@shared/creator-requests";
import { auth, db } from "./db";
import {
  approveCreatorRequest,
  handleCreatorRequestCreated,
  rejectCreatorRequest,
} from "./creator-requests";

const PROJECT = "demo-forma";
const APP_URL = "https://app.test";

const request: CreatorRequestDoc = {
  uid: "lea",
  email: "lea@test.fr",
  displayName: "Léa Martin",
  schoolName: "Studio Léa",
  slug: "studio-lea",
  message: "Formations Blender",
  status: "pending",
  createdAt: Timestamp.now(),
};

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
  await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`,
    { method: "DELETE" },
  );
  await auth().createUser({ uid: "lea", email: "lea@test.fr", displayName: "Léa Martin" });
  await db().doc("platformAdmins/quentin").set({ email: "quentin@test.fr" });
  await db().doc("users/quentin").set({ email: "quentin@test.fr", notifyOnComment: true });
  await db().doc("creators/quentin").set({ name: "Quentin Robert", slug: "quentin-robert" });
  await db().doc("creatorRequests/lea").set(request);
});

describe("demandes d'espace formateur", () => {
  it("prévient les administrateurs de la plateforme", async () => {
    await handleCreatorRequestCreated(request, APP_URL);
    const notification = await db().doc("users/quentin/notifications/creator_request_lea").get();
    expect(notification.data()).toMatchObject({ type: "creator_request" });
    const mail = await db().doc("mail/creator_request_lea_quentin").get();
    expect(mail.data()).toMatchObject({ to: "quentin@test.fr", creatorId: "quentin" });
  });

  it("acceptée : école créée, droits de propriétaire, demandeur prévenu", async () => {
    await approveCreatorRequest({
      uid: "lea",
      slug: "studio-lea",
      deciderUid: "quentin",
      appUrl: APP_URL,
    });
    expect((await db().doc("creators/lea").get()).data()).toMatchObject({
      name: "Studio Léa",
      slug: "studio-lea",
      supportEmail: "lea@test.fr",
      adminUids: ["lea"],
    });
    expect((await auth().getUser("lea")).customClaims).toMatchObject({
      creator: true,
      schools: ["lea"],
    });
    expect((await db().doc("creatorRequests/lea").get()).data()?.status).toBe("approved");
    expect(
      (await db().doc("users/lea/notifications/creator_request_decision").get()).data()?.type,
    ).toBe("creator_request_decision");
    await expect(
      approveCreatorRequest({
        uid: "lea",
        slug: "studio-lea",
        deciderUid: "quentin",
        appUrl: APP_URL,
      }),
    ).rejects.toThrow("déjà traitée");
  });

  it("adresse déjà prise : la demande reste en attente", async () => {
    await expect(
      approveCreatorRequest({
        uid: "lea",
        slug: "quentin-robert",
        deciderUid: "quentin",
        appUrl: APP_URL,
      }),
    ).rejects.toThrow("déjà prise");
    expect((await db().doc("creatorRequests/lea").get()).data()?.status).toBe("pending");
    expect((await db().doc("creators/lea").get()).exists).toBe(false);
  });

  it("refusée : motif enregistré, pas d'école", async () => {
    await rejectCreatorRequest({
      uid: "lea",
      reason: "Hors thématique",
      deciderUid: "quentin",
      appUrl: APP_URL,
    });
    expect((await db().doc("creatorRequests/lea").get()).data()).toMatchObject({
      status: "rejected",
      rejectionReason: "Hors thématique",
    });
    expect((await db().doc("creators/lea").get()).exists).toBe(false);
  });
});
