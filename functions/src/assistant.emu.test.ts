import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_PLATFORM_DAILY_LIMIT,
  type AssistantTurn,
} from "@shared/assistant";
import {
  askAssistant,
  deleteAssistantKey,
  saveAssistantKey,
  type AssistantClient,
} from "./assistant";
import { db } from "./db";

const PROJECT = "demo-forma";
const key = () => Buffer.alloc(32, 7);

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

const calls: { apiKey: string; system: string; messages: AssistantTurn[] }[] = [];
const client: AssistantClient = {
  async validateKey(apiKey) {
    if (apiKey.endsWith("bad")) throw new Error("refusée");
  },
  async answer(apiKey, params) {
    calls.push({ apiKey, ...params });
    return "Réponse";
  },
};
const API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234";

beforeEach(async () => {
  calls.length = 0;
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db().doc("creators/theo").set({ name: "Ecole Motion" });
  await db()
    .doc("courses/c1")
    .set({
      creatorId: "theo",
      title: "After Effects",
      assistant: true,
      items: [{ id: "l1", kind: "lesson", title: "L'interface" }],
    });
  await db()
    .doc("courses/c1/lessons/l1")
    .set({
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Panneau central." }] }],
      },
    });
  await db().doc("enrollments/c1_lea").set({ courseId: "c1", uid: "lea", status: "active" });
});

const ask = (uid = "lea", question = "Où est le panneau ?", schools: string[] = []) =>
  askAssistant(
    {
      input: {
        courseId: "c1",
        lessonId: "l1",
        question,
        history: [
          { role: "assistant", content: "orphelin" },
          { role: "user", content: "Bonjour" },
          { role: "assistant", content: "Salut !" },
        ],
      },
      uid,
      schools,
    },
    { key, client, now: new Date("2026-09-27T10:00:00Z") },
  );

describe("assistant IA", () => {
  it("clé vérifiée puis chiffrée ; l'assistant est activé", async () => {
    await expect(saveAssistantKey(`${API_KEY}bad`, { key, client })).rejects.toThrow("refusée");
    expect(await saveAssistantKey(API_KEY, { key, client })).toEqual({ keyLast4: "1234" });
    const secret = (await db().doc("platformSecrets/assistant").get()).data();
    expect(secret?.apiKey).not.toContain("sk-ant");
    expect((await db().doc("platform/assistant").get()).data()).toMatchObject({
      enabled: true,
      keyLast4: "1234",
    });
  });

  it("répond à un élève inscrit avec le contenu de la formation", async () => {
    await expect(ask()).rejects.toThrow("pas disponible");
    await saveAssistantKey(API_KEY, { key, client });
    const result = await ask();
    expect(result).toEqual({ answer: "Réponse", remaining: ASSISTANT_DAILY_LIMIT - 1 });
    expect(calls[0]?.apiKey).toBe(API_KEY);
    expect(calls[0]?.system).toContain("Panneau central.");
    expect(calls[0]?.messages).toEqual([
      { role: "user", content: "Bonjour" },
      { role: "assistant", content: "Salut !" },
      { role: "user", content: "Leçon en cours : « L'interface »\n\nOù est le panneau ?" },
    ]);
  });

  it("refusé hors inscription, formation sans assistant, ou quota atteint", async () => {
    await saveAssistantKey(API_KEY, { key, client });
    await expect(ask("inconnu")).rejects.toThrow("pas inscrit");
    await expect(ask("quentin", "Test ?", ["theo"])).resolves.toMatchObject({ answer: "Réponse" });
    await db().doc("assistantUsage/lea_2026-09-27").set({ count: ASSISTANT_DAILY_LIMIT });
    await expect(ask()).rejects.toThrow(`${ASSISTANT_DAILY_LIMIT} questions aujourd'hui`);
    await db()
      .doc("assistantUsage/_platform_2026-09-27")
      .set({ count: ASSISTANT_PLATFORM_DAILY_LIMIT });
    await expect(ask("quentin", "Test ?", ["theo"])).rejects.toThrow("limite du jour");
    await db().doc("assistantUsage/_platform_2026-09-27").delete();
    await db().doc("courses/c1").update({ assistant: false });
    await expect(ask("quentin", "Test ?", ["theo"])).rejects.toThrow("pas activé");
    await deleteAssistantKey();
    expect((await db().doc("platform/assistant").get()).data()).toMatchObject({ enabled: false });
  });
});
