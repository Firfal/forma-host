import { randomBytes } from "node:crypto";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  deleteVimeoSettings,
  loadVimeoToken,
  saveVimeoSettings,
  VimeoSetupError,
} from "./vimeo-settings";

const PROJECT = "demo-forma";
const key = randomBytes(32);
const deps = {
  key: () => key,
  fetchMe: async (token: string) => {
    if (token === "refuse") throw new VimeoSetupError("Token refusé par Vimeo.");
    return { name: "Théo Robert", account: "basic" };
  },
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
});

describe("token Vimeo de l'école", () => {
  it("vérifie, chiffre et relit le token", async () => {
    const account = await saveVimeoSettings("theo", "a1b2c3d4e5f6a7b8c9d0", deps);
    expect(account).toEqual({ name: "Théo Robert", account: "basic" });
    const secret = (await db().doc("creators/theo/secrets/vimeo").get()).data();
    expect(JSON.stringify(secret)).not.toContain("a1b2c3d4e5f6a7b8c9d0");
    expect((await db().doc("creators/theo/private/vimeo").get()).data()).toMatchObject({
      accountName: "Théo Robert",
      account: "basic",
    });
    expect(await loadVimeoToken("theo", deps.key)).toBe("a1b2c3d4e5f6a7b8c9d0");
    expect(await loadVimeoToken("autre", deps.key)).toBeNull();

    await deleteVimeoSettings("theo");
    expect(await loadVimeoToken("theo", deps.key)).toBeNull();
  });

  it("n'enregistre pas un token refusé par Vimeo", async () => {
    await expect(saveVimeoSettings("theo", "refuse", deps)).rejects.toThrow("refusé");
    expect((await db().doc("creators/theo/private/vimeo").get()).exists).toBe(false);
  });
});
