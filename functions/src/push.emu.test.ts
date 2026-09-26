import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PushData } from "@shared/push";
import { db } from "./db";
import { fakePushSender, pushNotification, type PushSender } from "./push";

const PROJECT = "demo-forma";
const notification = {
  title: "Nouvel élève",
  body: "Léa a rejoint « Motion 101 »",
  link: "/admin/formations/c1",
};

async function addToken(uid: string, id: string, token: string, minutesAgo = 0) {
  const at = Timestamp.fromMillis(Date.now() - minutesAgo * 60_000);
  await db()
    .doc(`users/${uid}/pushTokens/${id}`)
    .set({ token, userAgent: "test", createdAt: at, updatedAt: at });
}

const tokenIds = async (uid: string) =>
  (await db().collection(`users/${uid}/pushTokens`).get()).docs.map((doc) => doc.id).sort();

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
});

describe("notifications push", () => {
  it("sans appareil activé : rien n'est envoyé", async () => {
    expect(await pushNotification("theo", "n1", notification, fakePushSender)).toEqual({
      sent: 0,
      removed: 0,
    });
    expect((await db().collection("_fakePush").get()).empty).toBe(true);
  });

  it("envoie sur chaque appareil et oublie les tokens périmés", async () => {
    await addToken("theo", "mac", "token-mac");
    await addToken("theo", "iphone", "token-iphone");
    await addToken("theo", "ancien", "perime-token");
    await addToken("lea", "autre", "token-lea");

    expect(await pushNotification("theo", "student_1", notification, fakePushSender)).toEqual({
      sent: 2,
      removed: 1,
    });
    expect(await tokenIds("theo")).toEqual(["iphone", "mac"]);
    expect(await tokenIds("lea")).toEqual(["autre"]);

    const sent = (await db().collection("_fakePush").get()).docs.map((doc) => doc.data());
    expect(sent).toHaveLength(1);
    expect(sent[0].tokens.sort()).toEqual(["token-iphone", "token-mac"]);
    expect(sent[0].data).toEqual({ ...notification, tag: "student_1" });
  });

  it("vise les 10 appareils les plus récents, avec un lien interne", async () => {
    for (let i = 0; i < 12; i++) await addToken("theo", `d${i}`, `token-${i}`, i);
    const calls: { tokens: string[]; data: PushData }[] = [];
    const sender: PushSender = {
      async send(tokens, data) {
        calls.push({ tokens, data });
        return tokens.map(() => ({ ok: false, stale: false }));
      },
    };

    const result = await pushNotification(
      "theo",
      "n2",
      { ...notification, link: "https://exemple.com" },
      sender,
    );
    expect(result).toEqual({ sent: 0, removed: 0 });
    expect(calls[0].tokens).toEqual(Array.from({ length: 10 }, (_, i) => `token-${i}`));
    expect(calls[0].data.link).toBe("/");
    // Une erreur passagère ne supprime aucun appareil.
    expect(await tokenIds("theo")).toHaveLength(12);
  });
});
