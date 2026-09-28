import { z } from "zod";

/**
 * Webhooks d'une école (Zapier, Make, n8n…) : à chaque événement choisi, la plateforme envoie
 * un POST JSON signé (HMAC SHA-256) à l'adresse de l'école. Rien n'est envoyé sans webhook.
 *
 * creators/{schoolId}/webhooks/{id} : lisible par l'équipe, écrit par les Functions.
 */

export const WEBHOOK_EVENTS = {
  "student.enrolled": "Nouvel élève inscrit",
  "order.paid": "Vente payée",
  "certificate.issued": "Certificat délivré",
  "submission.created": "Exercice rendu",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
export const WEBHOOK_EVENT_IDS = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[];
export const MAX_WEBHOOKS = 10;
export const SIGNATURE_HEADER = "X-Forma-Signature";

export interface WebhookDoc<T = unknown> {
  url: string;
  events: WebhookEvent[];
  /** Clé de signature (HMAC SHA-256 du corps), à vérifier côté outil. */
  secret: string;
  createdAt: T;
  lastDeliveryAt: T | null;
  /** Code HTTP de la dernière livraison (0 : pas de réponse). */
  lastStatus: number | null;
  lastEvent: WebhookEvent | "ping" | null;
  failures: number;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent | "ping";
  createdAt: string;
  school: { id: string; name: string };
  data: Record<string, unknown>;
}

/** Adresse publique en https uniquement (pas d'IP, ni de nom interne). */
export function webhookUrlError(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "Adresse invalide";
  }
  if (url.protocol !== "https:") return "L'adresse doit commencer par https://";
  const host = url.hostname.toLowerCase();
  if (
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.startsWith("[") ||
    host === "localhost" ||
    /\.(local|internal|localhost)$/.test(host)
  ) {
    return "Adresse publique requise (pas d'adresse IP ni de nom local)";
  }
  if (url.username || url.password) return "Adresse sans identifiants";
  return null;
}

export const webhookInput = z.object({
  schoolId: z.string().min(1).max(128),
  url: z
    .string()
    .trim()
    .max(2000, "Adresse trop longue")
    .superRefine((value, ctx) => {
      const error = webhookUrlError(value);
      if (error) ctx.addIssue({ code: "custom", message: error });
    }),
  events: z
    .array(z.enum(WEBHOOK_EVENT_IDS as [WebhookEvent, ...WebhookEvent[]]))
    .min(1, "Choisis au moins un événement")
    .transform((events) => [...new Set(events)]),
});
export type WebhookInput = z.input<typeof webhookInput>;

export const webhookIdInput = z.object({
  schoolId: z.string().min(1).max(128),
  webhookId: z.string().min(1).max(128),
});
export type WebhookIdInput = z.infer<typeof webhookIdInput>;

/** Exemples envoyés par « Tester » (même forme que les vrais événements). */
export const WEBHOOK_SAMPLES: Record<WebhookEvent, Record<string, unknown>> = {
  "student.enrolled": {
    courseId: "exemple",
    courseTitle: "Ma formation",
    email: "eleve@exemple.fr",
    name: "Élève Exemple",
    source: "stripe",
  },
  "order.paid": {
    orderId: "exemple",
    courseId: "exemple",
    courseTitle: "Ma formation",
    email: "eleve@exemple.fr",
    name: "Élève Exemple",
    amount: 19700,
    currency: "eur",
    promoCode: null,
    installments: null,
    livemode: false,
  },
  "certificate.issued": {
    certificateId: "exemple",
    courseId: "exemple",
    courseTitle: "Ma formation",
    studentName: "Élève Exemple",
  },
  "submission.created": {
    submissionId: "exemple",
    courseId: "exemple",
    lessonTitle: "Leçon",
    studentName: "Élève Exemple",
  },
};
