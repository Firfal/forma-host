import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";
import {
  addSchoolDomain,
  fakeActivate,
  fakeDomains,
  refreshSchoolDomain,
  removeSchoolDomain,
  schoolBaseUrl,
  syncPendingDomains,
} from "./domains";

const PROJECT = "demo-forma";
const APP_URL = "https://app.test";
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
  await db().doc("users/theo").set({ email: "theo@test.fr" });
});

describe("domaine personnalisé d'une école", () => {
  it("en attente : enregistrements de l'opération, hébergeur détecté, puis retrait", async () => {
    const domain = await addSchoolDomain("theo", "formation.ecolemotion.com", fakeDomains, APP_URL);
    expect(domain).toMatchObject({
      status: "pending",
      hostState: "HOST_UNHOSTED",
      ownershipState: "OWNERSHIP_MISSING",
      dnsProvider: "ionos",
    });
    expect(domain.records.map((record) => [record.type, record.action, record.found])).toEqual([
      ["A", "add", false],
      ["TXT", "add", false],
      ["CNAME", "add", false],
    ]);
    expect((await creator("theo")).customDomain).toMatchObject({
      host: "formation.ecolemotion.com",
      status: "pending",
      records: domain.records,
    });
    expect((await db().doc("domains/formation.ecolemotion.com").get()).data()).toEqual({
      schoolId: "theo",
      status: "pending",
      operation: "operations/fake-formation.ecolemotion.com",
    });
    expect((await refreshSchoolDomain("theo", fakeDomains, APP_URL)).status).toBe("pending");
    expect(await schoolBaseUrl("theo", APP_URL)).toBe(APP_URL);

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

  it("DNS publiés : enregistrements détectés, vérification en cours", async () => {
    const domain = await addSchoolDomain("theo", "verif.ecolemotion.com", fakeDomains, APP_URL);
    expect(domain).toMatchObject({ status: "pending", ownershipState: "OWNERSHIP_PENDING" });
    expect(domain.records.every((record) => record.found)).toBe(true);
    await removeSchoolDomain("theo", fakeDomains);
  });

  it("domaine relié avant le suivi de l'opération : opération retrouvée", async () => {
    await addSchoolDomain("theo", "ancien.ecolemotion.com", fakeDomains);
    await db().doc("domains/ancien.ecolemotion.com").set({ schoolId: "theo", status: "pending" });
    await db().doc("creators/theo").update({ "customDomain.records": [] });
    const domain = await refreshSchoolDomain("theo", fakeDomains);
    expect(domain.records).toHaveLength(3);
    expect((await db().doc("domains/ancien.ecolemotion.com").get()).data()?.operation).toBe(
      "operations/fake-ancien.ecolemotion.com",
    );
    await removeSchoolDomain("theo", fakeDomains);
  });

  it("vérification planifiée : activation, notification et email une seule fois", async () => {
    await addSchoolDomain("theo", "bientot.ecolemotion.com", fakeDomains, APP_URL);
    expect(await syncPendingDomains(fakeDomains, APP_URL)).toEqual({
      checked: 1,
      activated: 0,
      failed: 0,
    });

    fakeActivate("bientot.ecolemotion.com");
    expect(await syncPendingDomains(fakeDomains, APP_URL)).toMatchObject({ activated: 1 });
    expect((await creator("theo")).customDomain).toMatchObject({ status: "active", records: [] });
    expect((await db().doc("domains/bientot.ecolemotion.com").get()).data()?.status).toBe("active");
    expect(await schoolBaseUrl("theo", APP_URL)).toBe("https://bientot.ecolemotion.com");
    expect((await db().doc("users/theo/notifications/domain_active").get()).data()).toMatchObject({
      type: "domain_active",
      link: "/admin/parametres",
    });

    // Déjà actif : plus vérifié par la tâche planifiée, et pas de second email.
    expect(await syncPendingDomains(fakeDomains, APP_URL)).toMatchObject({ checked: 0 });
    await refreshSchoolDomain("theo", fakeDomains, APP_URL);
    const mails = await db().collection("mail").where("to", "==", "theo@test.fr").get();
    expect(mails.docs.map((doc) => doc.data().message.subject)).toEqual([
      "bientot.ecolemotion.com est en ligne",
    ]);
    await removeSchoolDomain("theo", fakeDomains);
  });

  it("actif tout de suite : les liens des emails utilisent le domaine de l'école", async () => {
    const domain = await addSchoolDomain("theo", "actif.ecolemotion.com", fakeDomains);
    expect(domain).toMatchObject({ status: "active", records: [] });
    expect(await schoolBaseUrl("theo", APP_URL)).toBe("https://actif.ecolemotion.com");
    await removeSchoolDomain("theo", fakeDomains);
  });
});
