import { Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { MAX_PUSH_DEVICES, pushData, type PushData, type PushTokenDoc } from "@shared/push";
import { paths } from "@shared/paths";
import type { NotificationDoc } from "@shared/types";
import { db } from "./db";

/** Résultat pour un token : envoyé, ou token à supprimer (appareil désinscrit). */
export interface PushOutcome {
  ok: boolean;
  /** Token invalide ou expiré : l'appareil ne recevra plus rien, on l'oublie. */
  stale: boolean;
}

export interface PushSender {
  send(tokens: string[], data: PushData): Promise<PushOutcome[]>;
}

// Codes qui désignent le token lui-même (pas « invalid-argument », qui peut venir du message).
const STALE_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/** Envoi réel par Firebase Cloud Messaging (messages « data », affichés par le service worker). */
export const fcmSender: PushSender = {
  async send(tokens, data) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data,
      webpush: { headers: { Urgency: "high", TTL: String(24 * 3600) } },
    });
    return response.responses.map((item) => ({
      ok: item.success,
      stale: !item.success && STALE_CODES.has(item.error?.code ?? ""),
    }));
  },
};

/**
 * FCM simulé (émulateurs, PUSH_FAKE=true) : chaque envoi est consigné dans _fakePush pour les
 * tests ; un token commençant par « perime » est refusé comme un appareil désinscrit.
 */
export const fakePushSender: PushSender = {
  async send(tokens, data) {
    const outcomes = tokens.map((token) => {
      const stale = token.startsWith("perime");
      return { ok: !stale, stale };
    });
    const delivered = tokens.filter((_, index) => outcomes[index].ok);
    if (delivered.length) await db().collection("_fakePush").add({ tokens: delivered, data });
    return outcomes;
  },
};

/** Notification créée, ou réémise avec une nouvelle date (le simple « lu » ne renvoie rien). */
export function isNewNotification(
  before: Pick<NotificationDoc, "createdAt"> | undefined,
  after: Pick<NotificationDoc, "createdAt" | "read">,
): boolean {
  if (after.read) return false;
  if (!before) return true;
  const date = (value: unknown) =>
    value instanceof Timestamp ? value.toMillis() : value == null ? null : String(value);
  return date(before.createdAt) !== date(after.createdAt);
}

/** Envoie une notification in-app sur les appareils de la personne, puis oublie les tokens périmés. */
export async function pushNotification(
  uid: string,
  notificationId: string,
  notification: Pick<NotificationDoc, "title" | "body" | "link">,
  sender: PushSender,
): Promise<{ sent: number; removed: number }> {
  const snap = await db()
    .collection(paths.pushTokens(uid))
    .orderBy("updatedAt", "desc")
    .limit(MAX_PUSH_DEVICES)
    .get();
  if (snap.empty) return { sent: 0, removed: 0 };

  const docs = snap.docs.filter((doc) => typeof (doc.data() as PushTokenDoc).token === "string");
  const tokens = docs.map((doc) => (doc.data() as PushTokenDoc).token);
  const outcomes = await sender.send(tokens, pushData({ id: notificationId, ...notification }));

  const stale = docs.filter((_, index) => outcomes[index]?.stale);
  if (stale.length) {
    const batch = db().batch();
    for (const doc of stale) batch.delete(doc.ref);
    await batch.commit();
  }
  return { sent: outcomes.filter((outcome) => outcome.ok).length, removed: stale.length };
}
