import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatorDoc } from "@shared/types";
import { auth, db } from "./db";
import {
  ensureSchoolOwner,
  inviteSchoolAdmin,
  removeSchoolAdmin,
  updateSchoolProfile,
} from "./schools";

const PROJECT = "demo-forma";
const profile = {
  name: "Ecole Motion",
  slug: "ecole-motion",
  logoUrl: null,
  brandColor: "#9D72F9",
  supportEmail: "theo@clastra.io",
};
const creator = async (id: string) => (await db().doc(`creators/${id}`).get()).data() as CreatorDoc;

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
  await db()
    .doc("creators/theo")
    .set({ ...profile, createdAt: new Date() });
  await db()
    .doc("creators/autre")
    .set({ ...profile, name: "Autre", slug: "autre-ecole", previousSlugs: ["ancienne"] });
});

describe("updateSchoolProfile", () => {
  it("met à jour le profil et garde l'ancienne adresse", async () => {
    await updateSchoolProfile("theo", { ...profile, name: "Motion School", slug: "motion" });
    expect(await creator("theo")).toMatchObject({
      name: "Motion School",
      slug: "motion",
      previousSlugs: ["ecole-motion"],
      brandColor: "#9d72f9",
    });
    // Retour à l'ancienne adresse : elle n'est plus une redirection.
    await updateSchoolProfile("theo", profile);
    expect(await creator("theo")).toMatchObject({
      slug: "ecole-motion",
      previousSlugs: ["motion"],
    });
  });

  it("refuse l'adresse (actuelle ou ancienne) d'une autre école", async () => {
    await expect(updateSchoolProfile("theo", { ...profile, slug: "autre-ecole" })).rejects.toThrow(
      "déjà prise",
    );
    await expect(updateSchoolProfile("theo", { ...profile, slug: "ancienne" })).rejects.toThrow(
      "déjà prise",
    );
    expect((await creator("theo")).slug).toBe("ecole-motion");
  });
});

describe("équipe de l'école", () => {
  beforeEach(async () => {
    await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`,
      { method: "DELETE" },
    );
    await auth().createUser({ uid: "theo", email: "theo@test.fr", displayName: "Théo" });
    await auth().setCustomUserClaims("theo", { creator: true });
  });

  it("propriétaire : fiche, adminUids et claims (idempotent)", async () => {
    await ensureSchoolOwner("theo");
    await ensureSchoolOwner("theo");
    expect((await db().doc("creators/theo/members/theo").get()).data()?.role).toBe("owner");
    expect((await creator("theo")).adminUids).toEqual(["theo"]);
    expect((await auth().getUser("theo")).customClaims).toMatchObject({
      creator: true,
      schools: ["theo"],
    });
  });

  it("invite un nouveau co-administrateur puis le retire", async () => {
    const { uid, activation } = await inviteSchoolAdmin({
      schoolId: "theo",
      email: "quentin@test.fr",
      inviterName: "Théo",
      appUrl: "https://app.test",
    });
    expect(activation).toBe(true);
    expect((await db().doc(`creators/theo/members/${uid}`).get()).data()?.role).toBe("admin");
    expect((await creator("theo")).adminUids).toContain(uid);
    expect((await auth().getUser(uid)).customClaims).toMatchObject({
      creator: true,
      schools: ["theo"],
    });
    expect((await db().doc(`users/${uid}`).get()).data()?.claimsUpdatedAt).toBeTruthy();

    const invites = await db().collection("invites").where("uid", "==", uid).get();
    expect(invites.docs[0].data()).toMatchObject({ kind: "member", courseId: null });
    const mails = await db().collection("mail").where("to", "==", "quentin@test.fr").get();
    expect(mails.docs[0].data().message.text).toContain("https://app.test/bienvenue/");
    expect(mails.docs[0].data().creatorId).toBe("theo");

    await expect(
      inviteSchoolAdmin({
        schoolId: "theo",
        email: "quentin@test.fr",
        inviterName: "Théo",
        appUrl: "https://app.test",
      }),
    ).rejects.toThrow("Déjà membre");

    await removeSchoolAdmin("theo", uid);
    expect((await db().doc(`creators/theo/members/${uid}`).get()).exists).toBe(false);
    expect((await creator("theo")).adminUids ?? []).not.toContain(uid);
    expect((await auth().getUser(uid)).customClaims).toMatchObject({
      creator: false,
      schools: [],
    });
    await expect(removeSchoolAdmin("theo", "theo")).rejects.toThrow("propriétaire");
  });

  it("un compte existant est notifié et garde ses autres écoles", async () => {
    await auth().createUser({ uid: "anne", email: "anne@test.fr", password: "motdepasse" });
    await auth().setCustomUserClaims("anne", { creator: true, schools: ["anne"] });
    const { activation } = await inviteSchoolAdmin({
      schoolId: "theo",
      email: "anne@test.fr",
      inviterName: "Théo",
      appUrl: "https://app.test",
    });
    expect(activation).toBe(false);
    expect((await auth().getUser("anne")).customClaims?.schools).toEqual(["anne", "theo"]);
    expect((await db().doc("users/anne/notifications/member_theo").get()).exists).toBe(true);
  });
});
