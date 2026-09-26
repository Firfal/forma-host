/**
 * Notifications push (Firebase Cloud Messaging, web push).
 * Un appareil = un token FCM, rangé dans users/{uid}/pushTokens/{id}, où id = SHA-256 du token.
 */

export interface PushTokenDoc<T = unknown> {
  token: string;
  /** Navigateur et système, pour reconnaître l'appareil. */
  userAgent: string | null;
  createdAt: T;
  updatedAt: T;
}

/** Données envoyées au service worker (messages « data » : c'est lui qui affiche la notification). */
export interface PushData {
  [key: string]: string;
  title: string;
  body: string;
  /** Chemin relatif à ouvrir au clic (ex. /admin/commentaires). */
  link: string;
  /** Identifiant de la notification : une notification rejouée remplace la précédente. */
  tag: string;
}

/** Au plus 10 appareils par personne reçoivent les notifications (les plus récents). */
export const MAX_PUSH_DEVICES = 10;

const TITLE_MAX = 120;
const BODY_MAX = 240;

function truncate(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Seuls les chemins internes sont ouverts au clic : jamais d'adresse externe. */
export function safeLink(link: string | null | undefined): string {
  if (!link || !link.startsWith("/") || link.startsWith("//") || link.includes("\\")) return "/";
  return link;
}

export function pushData(notification: {
  id: string;
  title: string;
  body: string;
  link: string;
}): PushData {
  return {
    title: truncate(notification.title, TITLE_MAX),
    body: truncate(notification.body, BODY_MAX),
    link: safeLink(notification.link),
    tag: notification.id,
  };
}

/** Identifiant du document d'un token : SHA-256 en hexadécimal (les tokens sont longs). */
export async function pushTokenId(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
