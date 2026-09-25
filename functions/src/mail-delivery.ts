import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { MailDeliveryState } from "@shared/types";
import { db } from "./db";
import type { MailDoc } from "./mail";
import { loadSmtpConfig, recordSendResult, type KeyProvider } from "./mail-settings";
import { smtpErrorMessage, type SmtpClient } from "./smtp";

/**
 * Envoi des documents de la collection `mail` avec les réglages SMTP de leur formateur.
 * Sans réglages, l'email reste en attente (NOT_CONFIGURED) et part dès qu'ils sont enregistrés.
 */

/** Durée pendant laquelle un envoi en cours bloque un second envoi du même email. */
const LEASE_MS = 2 * 60_000;
/** Au-delà, un email en échec n'est plus renvoyé automatiquement. */
export const MAX_ATTEMPTS = 5;
const RESEND_CONCURRENCY = 4;

export interface DeliveryDeps {
  key: KeyProvider;
  client: SmtpClient;
}

/**
 * Réserve l'email (transaction), l'envoie et enregistre le résultat.
 * Idempotent : un déclencheur rejoué ou un email déjà parti est ignoré (retour null).
 */
export async function deliverMail(
  mailId: string,
  deps: DeliveryDeps,
): Promise<MailDeliveryState | null> {
  const ref = db().doc(`mail/${mailId}`);
  const mail = await db().runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data() as MailDoc | undefined;
    if (!data) return null;
    const delivery = data.delivery;
    if (delivery?.state === "SUCCESS") return null;
    if (
      delivery?.state === "PROCESSING" &&
      (delivery.leaseExpireAt?.toMillis() ?? 0) > Date.now()
    ) {
      return null;
    }
    tx.set(
      ref,
      {
        delivery: {
          state: "PROCESSING",
          attempts: delivery?.attempts ?? 0,
          error: delivery?.error ?? null,
          leaseExpireAt: Timestamp.fromMillis(Date.now() + LEASE_MS),
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
    return data;
  });
  if (!mail) return null;

  const previousAttempts = mail.delivery?.attempts ?? 0;
  const attempts = previousAttempts + 1;
  try {
    const config = mail.creatorId ? await loadSmtpConfig(mail.creatorId, deps.key) : null;
    if (!config) {
      await ref.update({
        delivery: {
          state: "NOT_CONFIGURED",
          attempts: previousAttempts,
          error: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      return "NOT_CONFIGURED";
    }
    const { messageId } = await deps.client.send(config, {
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.message.subject,
      html: mail.message.html,
      text: mail.message.text,
    });
    await ref.update({
      delivery: {
        state: "SUCCESS",
        attempts,
        error: null,
        messageId,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    await recordSendResult(mail.creatorId, null);
    return "SUCCESS";
  } catch (error) {
    const message = smtpErrorMessage(error);
    await ref.update({
      delivery: {
        state: "ERROR",
        attempts,
        error: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    await recordSendResult(mail.creatorId, `${message} — email à ${mail.to}`);
    return "ERROR";
  }
}

/** Renvoie les emails en attente de réglages ou en échec (après enregistrement des réglages). */
export async function resendWaitingMail(
  creatorId: string,
  deps: DeliveryDeps,
): Promise<{ sent: number; failed: number }> {
  const snap = await db()
    .collection("mail")
    .where("creatorId", "==", creatorId)
    .where("delivery.state", "in", ["NOT_CONFIGURED", "ERROR"])
    .limit(500)
    .get();
  const ids = snap.docs
    .filter((doc) => ((doc.data() as MailDoc).delivery?.attempts ?? 0) < MAX_ATTEMPTS)
    .map((doc) => doc.id);

  const result = { sent: 0, failed: 0 };
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const state = await deliverMail(ids[next++], deps);
      if (state === "SUCCESS") result.sent += 1;
      else if (state === "ERROR") result.failed += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(RESEND_CONCURRENCY, ids.length) }, worker));
  return result;
}
