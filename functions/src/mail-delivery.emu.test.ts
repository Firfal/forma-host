import { randomBytes } from "node:crypto";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MailSettingsInput } from "@shared/mail-settings";
import type { MailSettingsDoc } from "@shared/types";
import { db } from "./db";
import { mailDoc, type MailDoc } from "./mail";
import { deliverMail, resendWaitingMail } from "./mail-delivery";
import { loadSmtpConfig, saveMailSettings } from "./mail-settings";
import type { OutgoingMail, SmtpClient, SmtpConfig } from "./smtp";

const PROJECT = "demo-forma";
const key = randomBytes(32);
let sent: { config: SmtpConfig; mail: OutgoingMail }[] = [];
let failNextSend: Error | null = null;

const authError = () =>
  Object.assign(new Error("Invalid login"), {
    code: "EAUTH",
    response: "535 Authentication failed",
  });

const client: SmtpClient = {
  async verify(config) {
    if (config.password === "mauvais") throw authError();
  },
  async send(config, mail) {
    if (failNextSend) {
      const error = failNextSend;
      failNextSend = null;
      throw error;
    }
    sent.push({ config, mail });
    return { messageId: `<${sent.length}@test>` };
  },
};
const deps = { key: () => key, client };

const brevo: MailSettingsInput = {
  provider: "brevo",
  username: "9a1b2c001@smtp-brevo.com",
  password: "xsmtpsib-123",
  fromName: "Ecole Motion",
  fromEmail: "contact@ecolemotion.com",
};

async function queueMail(id: string, creatorId = "theo") {
  await db()
    .doc(`mail/${id}`)
    .set(
      mailDoc({
        creatorId,
        to: "anne@test.fr",
        subject: "Bienvenue",
        html: "<p>Salut</p>",
        text: "Salut",
      }),
    );
}

const mail = async (id: string) => (await db().doc(`mail/${id}`).get()).data() as MailDoc;
const settings = async () =>
  (await db().doc("creators/theo/private/mail").get()).data() as MailSettingsDoc | undefined;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

beforeEach(async () => {
  sent = [];
  failNextSend = null;
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
});

describe("envoi des emails", () => {
  it("sans réglages, l'email attend puis part dès l'enregistrement", async () => {
    await queueMail("m1");
    expect(await deliverMail("m1", deps)).toBe("NOT_CONFIGURED");
    expect((await mail("m1")).delivery?.state).toBe("NOT_CONFIGURED");
    expect(sent).toHaveLength(0);

    await saveMailSettings("theo", brevo, deps);
    const secret = (await db().doc("creators/theo/secrets/mail").get()).data();
    expect(JSON.stringify(secret)).not.toContain("xsmtpsib-123");
    expect(await settings()).toMatchObject({ host: "smtp-relay.brevo.com", port: 587 });

    expect(await resendWaitingMail("theo", deps)).toEqual({ sent: 1, failed: 0 });
    expect(sent[0].config).toMatchObject({ password: "xsmtpsib-123", fromEmail: brevo.fromEmail });
    expect(sent[0].mail).toMatchObject({ to: "anne@test.fr", subject: "Bienvenue" });
    expect((await mail("m1")).delivery).toMatchObject({ state: "SUCCESS", attempts: 1 });
    expect((await settings())?.lastSentAt).toBeTruthy();
  });

  it("n'envoie jamais deux fois le même email", async () => {
    await saveMailSettings("theo", brevo, deps);
    await queueMail("m1");
    expect(await deliverMail("m1", deps)).toBe("SUCCESS");
    expect(await deliverMail("m1", deps)).toBeNull();
    expect(await resendWaitingMail("theo", deps)).toEqual({ sent: 0, failed: 0 });
    expect(sent).toHaveLength(1);
  });

  it("n'enregistre pas des identifiants refusés par le serveur", async () => {
    await expect(saveMailSettings("theo", { ...brevo, password: "mauvais" }, deps)).rejects.toThrow(
      "Invalid login",
    );
    expect(await settings()).toBeUndefined();
  });

  it("conserve le mot de passe enregistré quand le champ est vide", async () => {
    await saveMailSettings("theo", brevo, deps);
    await saveMailSettings("theo", { ...brevo, password: "", fromName: "Théo" }, deps);
    expect(await loadSmtpConfig("theo", deps.key)).toMatchObject({
      password: "xsmtpsib-123",
      fromName: "Théo",
    });
    await expect(saveMailSettings("anne", { ...brevo, password: undefined }, deps)).rejects.toThrow(
      "Mot de passe requis",
    );
  });

  it("Gmail : le mot de passe d'application est collé avec ses espaces", async () => {
    await saveMailSettings(
      "theo",
      { ...brevo, provider: "gmail", password: "abcd efgh ijkl mnop" },
      deps,
    );
    expect(await loadSmtpConfig("theo", deps.key)).toMatchObject({
      host: "smtp.gmail.com",
      port: 465,
      password: "abcdefghijklmnop",
    });
  });

  it("un échec d'envoi est visible dans les réglages, puis renvoyé", async () => {
    await saveMailSettings("theo", brevo, deps);
    await queueMail("m1");
    failNextSend = authError();
    expect(await deliverMail("m1", deps)).toBe("ERROR");
    expect((await mail("m1")).delivery).toMatchObject({ state: "ERROR", attempts: 1 });
    expect((await settings())?.lastError).toContain("Identifiant ou mot de passe refusé");

    expect(await resendWaitingMail("theo", deps)).toEqual({ sent: 1, failed: 0 });
    expect((await mail("m1")).delivery).toMatchObject({ state: "SUCCESS", attempts: 2 });
    expect((await settings())?.lastError).toBeNull();
  });

  it("utilise uniquement les réglages du formateur de l'email", async () => {
    await saveMailSettings("theo", brevo, deps);
    await queueMail("m2", "autre-formateur");
    expect(await deliverMail("m2", deps)).toBe("NOT_CONFIGURED");
    expect(sent).toHaveLength(0);
  });
});
