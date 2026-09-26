import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";
import { updateSchoolProfile } from "./schools";

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
