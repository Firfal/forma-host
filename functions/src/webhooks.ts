import { createHmac, randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import {
  MAX_WEBHOOKS,
  SIGNATURE_HEADER,
  WEBHOOK_SAMPLES,
  type WebhookDoc,
  type WebhookEvent,
  type WebhookPayload,
} from "@shared/webhooks";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

/** Erreur au message déjà lisible par le formateur. */
export class WebhookError extends Error {}

/** Envoie le corps signé ; retourne le code HTTP (0 : pas de réponse). Remplaçable en test. */
export type WebhookSender = (
  url: string,
  body: string,
  headers: Record<string, string>,
) => Promise<number>;

export const httpSender: WebhookSender = async (url, body, headers) => {
  try {
    const response = await fetch(url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Forma-Host-Webhooks/1.0",
        ...headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return response.status;
  } catch {
    return 0;
  }
};

/** Émulateurs : livraisons consignées dans _fakeWebhooks (« echec » dans l'adresse : 500). */
export const fakeSender: WebhookSender = async (url, body, headers) => {
  await db()
    .collection("_fakeWebhooks")
    .add({ url, body, headers, at: FieldValue.serverTimestamp() });
  return url.includes("echec") ? 500 : 200;
};

export function signBody(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const hooks = (schoolId: string) => db().collection(`creators/${schoolId}/webhooks`);

export async function saveWebhook(input: {
  schoolId: string;
  url: string;
  events: WebhookEvent[];
}): Promise<{ id: string }> {
  const existing = await hooks(input.schoolId).count().get();
  if (existing.data().count >= MAX_WEBHOOKS) {
    throw new WebhookError(`${MAX_WEBHOOKS} webhooks maximum par école.`);
  }
  const ref = hooks(input.schoolId).doc();
  await ref.set({
    url: input.url,
    events: input.events,
    secret: `whsec_${randomBytes(24).toString("base64url")}`,
    createdAt: FieldValue.serverTimestamp(),
    lastDeliveryAt: null,
    lastStatus: null,
    lastEvent: null,
    failures: 0,
  });
  return { id: ref.id };
}

export async function deleteWebhook(schoolId: string, webhookId: string): Promise<void> {
  await hooks(schoolId).doc(webhookId).delete();
}

async function schoolName(schoolId: string): Promise<string> {
  const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
  return creator?.name ?? "";
}

/** Livre un événement à un webhook et mémorise le résultat (2xx : réussite). */
async function deliver(
  schoolId: string,
  webhookId: string,
  hook: WebhookDoc,
  payload: WebhookPayload,
  sender: WebhookSender,
): Promise<number> {
  const body = JSON.stringify(payload);
  const status = await sender(hook.url, body, {
    [SIGNATURE_HEADER]: signBody(hook.secret, body),
    "X-Forma-Event": payload.event,
    "X-Forma-Delivery": payload.id,
  });
  const ok = status >= 200 && status < 300;
  await hooks(schoolId)
    .doc(webhookId)
    .update({
      lastDeliveryAt: FieldValue.serverTimestamp(),
      lastStatus: status,
      lastEvent: payload.event,
      failures: ok ? 0 : FieldValue.increment(1),
    })
    .catch(() => undefined);
  return status;
}

/**
 * Envoie un événement à tous les webhooks de l'école abonnés. `deliveryId` stable : un
 * déclencheur rejoué renvoie le même identifiant (l'outil peut dédoublonner).
 */
export async function dispatchWebhookEvent(params: {
  schoolId: string;
  event: WebhookEvent;
  deliveryId: string;
  data: Record<string, unknown>;
  sender: WebhookSender;
}): Promise<number> {
  const snap = await hooks(params.schoolId).where("events", "array-contains", params.event).get();
  if (snap.empty) return 0;
  const payload: WebhookPayload = {
    id: params.deliveryId,
    event: params.event,
    createdAt: new Date().toISOString(),
    school: { id: params.schoolId, name: await schoolName(params.schoolId) },
    data: params.data,
  };
  await Promise.all(
    snap.docs.map((doc) =>
      deliver(params.schoolId, doc.id, doc.data() as WebhookDoc, payload, params.sender),
    ),
  );
  return snap.size;
}

/** « Tester » : envoie un événement ping avec un exemple du premier événement choisi. */
export async function testWebhook(
  schoolId: string,
  webhookId: string,
  sender: WebhookSender,
): Promise<{ status: number }> {
  const snap = await hooks(schoolId).doc(webhookId).get();
  const hook = snap.data() as WebhookDoc | undefined;
  if (!hook) throw new WebhookError("Webhook introuvable.");
  const sample = hook.events[0] ?? "student.enrolled";
  const status = await deliver(
    schoolId,
    webhookId,
    hook,
    {
      id: `ping_${randomBytes(8).toString("hex")}`,
      event: "ping",
      createdAt: new Date().toISOString(),
      school: { id: schoolId, name: await schoolName(schoolId) },
      data: {
        message: "Test depuis Forma Host",
        sampleEvent: sample,
        sample: WEBHOOK_SAMPLES[sample],
      },
    },
    sender,
  );
  return { status };
}
