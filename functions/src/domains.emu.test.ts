import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";
import {
  addSchoolDomain,
  fakeDomains,
  refreshSchoolDomain,
  removeSchoolDomain,
  schoolBaseUrl,
} from "./domains";

const PROJECT = "demo-forma";
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
  await db().doc("creators/theo").set({ name: "Ecole Motion", slug: "ecole-motion" });
  await db().doc("creators/autre").set({ name: "Autre", slug: "autre" });
});

describe("domaine personnalisé d'une école", () => {
  it("en attente de DNS : enregistrements à ajouter, puis retrait", async () => {
    const domain = await addSchoolDomain("theo", "formation.ecolemotion.com", fakeDomains);
    expect(domain.status).toBe("pending");
    expect(domain.records.map((record) => record.type)).toEqual(["A", "TXT"]);
    expect((await creator("theo")).customDomain).toMatchObject({
      host: "formation.ecolemotion.com",
      status: "pending",
    });
    expect((await db().doc("domains/formation.ecolemotion.com").get()).data()).toEqual({
      schoolId: "theo",
      status: "pending",
    });
    expect((await refreshSchoolDomain("theo", fakeDomains)).status).toBe("pending");
    expect(await schoolBaseUrl("theo", "https://app.test")).toBe("https://app.test");

    await expect(addSchoolDomain("theo", "autre.ecolemotion.com", fakeDomains)).rejects.toThrow(
      "Retire d'abord",
    );
    await expect(
      addSchoolDomain("autre", "formation.ecolemotion.com", fakeDomains),
    ).rejects.toThrow("déjà utilisé");

    await removeSchoolDomain("theo", fakeDomains);
    expect((await creator("theo")).customDomain).toBeUndefined();
    expect((await db().doc("domains/formation.ecolemotion.com").get()).exists).toBe(false);
  });

  it("actif : les liens des emails utilisent le domaine de l'école", async () => {
    const domain = await addSchoolDomain("theo", "actif.ecolemotion.com", fakeDomains);
    expect(domain).toMatchObject({ status: "active", records: [] });
    expect(await schoolBaseUrl("theo", "https://app.test")).toBe("https://actif.ecolemotion.com");
  });
});
