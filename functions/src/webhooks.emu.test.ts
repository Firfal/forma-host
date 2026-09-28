import { createHmac } from "node:crypto";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  deleteWebhook,
  dispatchWebhookEvent,
  saveWebhook,
  testWebhook,
  type WebhookSender,
} from "./webhooks";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
const sender: WebhookSender = async (url, body, headers) => {
  sent.push({ url, body, headers });
  return url.includes("echec") ? 500 : 200;
};

beforeEach(async () => {
  sent.length = 0;
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db().doc("creators/theo").set({ name: "Ecole Motion" });
});

describe("webhooks", () => {
  it("envoie l'événement signé aux seuls webhooks abonnés, et note le résultat", async () => {
    const { id } = await saveWebhook({
      schoolId: "theo",
      url: "https://hooks.zapier.com/a",
      events: ["order.paid"],
    });
    await saveWebhook({
      schoolId: "theo",
      url: "https://hook.make.com/echec",
      events: ["order.paid", "student.enrolled"],
    });
    await saveWebhook({
      schoolId: "theo",
      url: "https://hooks.zapier.com/autre",
      events: ["certificate.issued"],
    });

    const count = await dispatchWebhookEvent({
      schoolId: "theo",
      event: "order.paid",
      deliveryId: "order.paid_o1",
      data: { orderId: "o1", amount: 19700 },
      sender,
    });
    expect(count).toBe(2);
    expect(sent.map((s) => s.url).sort()).toEqual([
      "https://hook.make.com/echec",
      "https://hooks.zapier.com/a",
    ]);

    const zapier = sent.find((s) => s.url.endsWith("/a"))!;
    const payload = JSON.parse(zapier.body);
    expect(payload).toMatchObject({
      id: "order.paid_o1",
      event: "order.paid",
      school: { id: "theo", name: "Ecole Motion" },
      data: { orderId: "o1", amount: 19700 },
    });
    const secret = (await db().doc(`creators/theo/webhooks/${id}`).get()).data()!.secret as string;
    expect(secret).toMatch(/^whsec_/);
    expect(zapier.headers["X-Forma-Signature"]).toBe(
      `sha256=${createHmac("sha256", secret).update(zapier.body).digest("hex")}`,
    );

    const hooks = await db().collection("creators/theo/webhooks").get();
    const byUrl = new Map(hooks.docs.map((doc) => [doc.get("url"), doc.data()]));
    expect(byUrl.get("https://hooks.zapier.com/a")).toMatchObject({
      lastStatus: 200,
      failures: 0,
      lastEvent: "order.paid",
    });
    expect(byUrl.get("https://hook.make.com/echec")).toMatchObject({
      lastStatus: 500,
      failures: 1,
    });
  });

  it("test : événement ping avec un exemple ; suppression", async () => {
    const { id } = await saveWebhook({
      schoolId: "theo",
      url: "https://hooks.zapier.com/a",
      events: ["student.enrolled"],
    });
    expect(await testWebhook("theo", id, sender)).toEqual({ status: 200 });
    const ping = JSON.parse(sent[0]!.body);
    expect(ping).toMatchObject({ event: "ping", data: { sampleEvent: "student.enrolled" } });
    await deleteWebhook("theo", id);
    await expect(testWebhook("theo", id, sender)).rejects.toThrow("introuvable");
  });
});
