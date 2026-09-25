import { FieldValue } from "firebase-admin/firestore";
import { smtpServer, type MailSettingsInput } from "@shared/mail-settings";
import { paths } from "@shared/paths";
import type { MailSettingsDoc } from "@shared/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { db } from "./db";
import { SmtpSetupError, type SmtpClient, type SmtpConfig } from "./smtp";

/**
 * Réglages d'envoi des emails d'un formateur :
 * - creators/{uid}/private/mail : serveur, identifiant, expéditeur, état (lisible par le formateur) ;
 * - creators/{uid}/secrets/mail : mot de passe chiffré (Functions uniquement).
 */

export interface MailSecretDoc {
  password: string;
}

/** Clé de chiffrement, chargée seulement quand un secret est lu ou écrit. */
export type KeyProvider = () => Buffer;

const secretContext = (uid: string) => `mail:${uid}`;

/** Vérifie la connexion avec les nouveaux réglages, puis les enregistre. */
export async function saveMailSettings(
  uid: string,
  input: MailSettingsInput,
  deps: { key: KeyProvider; client: SmtpClient },
): Promise<void> {
  const settingsRef = db().doc(paths.creatorMailSettings(uid));
  const secretRef = db().doc(paths.creatorMailSecret(uid));
  const { host, port } = smtpServer(input);

  let password = input.password ?? "";
  if (!password) {
    const secret = (await secretRef.get()).data() as MailSecretDoc | undefined;
    if (!secret) throw new SmtpSetupError("Mot de passe requis.");
    password = decryptSecret(secret.password, deps.key(), secretContext(uid));
  }

  const config: SmtpConfig = {
    host,
    port,
    username: input.username,
    password,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
  };
  await deps.client.verify(config);

  const batch = db().batch();
  batch.set(secretRef, {
    password: encryptSecret(password, deps.key(), secretContext(uid)),
  } satisfies MailSecretDoc);
  batch.set(settingsRef, {
    provider: input.provider,
    host,
    port,
    username: input.username,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    updatedAt: FieldValue.serverTimestamp(),
    lastSentAt: null,
    lastError: null,
    lastErrorAt: null,
  });
  await batch.commit();
}

export async function deleteMailSettings(uid: string): Promise<void> {
  const batch = db().batch();
  batch.delete(db().doc(paths.creatorMailSettings(uid)));
  batch.delete(db().doc(paths.creatorMailSecret(uid)));
  await batch.commit();
}

/** Réglages complets (mot de passe déchiffré), ou null si l'envoi n'est pas configuré. */
export async function loadSmtpConfig(uid: string, key: KeyProvider): Promise<SmtpConfig | null> {
  const [settingsSnap, secretSnap] = await Promise.all([
    db().doc(paths.creatorMailSettings(uid)).get(),
    db().doc(paths.creatorMailSecret(uid)).get(),
  ]);
  const settings = settingsSnap.data() as MailSettingsDoc | undefined;
  const secret = secretSnap.data() as MailSecretDoc | undefined;
  if (!settings || !secret) return null;
  return {
    host: settings.host,
    port: settings.port,
    username: settings.username,
    password: decryptSecret(secret.password, key(), secretContext(uid)),
    fromName: settings.fromName,
    fromEmail: settings.fromEmail,
  };
}

/** Garde la trace du dernier envoi réussi ou en échec, affichée dans Paramètres. */
export async function recordSendResult(uid: string, error: string | null): Promise<void> {
  const ref = db().doc(paths.creatorMailSettings(uid));
  const update = error
    ? { lastError: error, lastErrorAt: FieldValue.serverTimestamp() }
    : { lastSentAt: FieldValue.serverTimestamp(), lastError: null, lastErrorAt: null };
  // Les réglages ont pu être supprimés entre-temps : rien à mettre à jour.
  await ref.update(update).catch(() => undefined);
}
