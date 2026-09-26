"use client";

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { paths } from "@shared/paths";
import { pushTokenId } from "@shared/push";
import { db, usingEmulators } from "@/lib/firebase/client";

/**
 * Notifications push sur cet appareil : token Firebase Cloud Messaging enregistré dans
 * users/{uid}/pushTokens/{sha256(token)}. Le navigateur retient l'id du token pour savoir si
 * l'appareil est activé, et le renouvelle au plus une fois par jour (FCM fait tourner les tokens).
 */

export type PushState = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const REFRESH_EVERY_MS = 24 * 3600 * 1000;

const storageKey = (uid: string) => `forma-host:push:${uid}`;

interface StoredDevice {
  tokenId: string;
  syncedAt: number;
}

function readStored(uid: string): StoredDevice | null {
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}

function writeStored(uid: string, device: StoredDevice | null) {
  try {
    if (device) window.localStorage.setItem(storageKey(uid), JSON.stringify(device));
    else window.localStorage.removeItem(storageKey(uid));
  } catch {
    // Stockage indisponible (navigation privée) : l'état sera relu depuis Firestore.
  }
}

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Web push possible ici ? Sur iPhone, seulement depuis l'app ajoutée à l'écran d'accueil. */
async function support(): Promise<"ok" | "unsupported" | "needs-install"> {
  const hasApis =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!hasApis) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (usingEmulators) return "ok";
  const { isSupported } = await import("firebase/messaging");
  return (await isSupported()) ? "ok" : "unsupported";
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Token FCM de ce navigateur (créé au besoin). Émulateurs : token simulé, stable par navigateur. */
async function currentToken(): Promise<string> {
  const registration = await serviceWorker();
  if (usingEmulators) {
    const key = "forma-host:push-fake-token";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const token = `emulateur-${crypto.randomUUID()}`;
    window.localStorage.setItem(key, token);
    return token;
  }
  const { getMessaging, getToken } = await import("firebase/messaging");
  // Sans clé VAPID propre au projet, le SDK utilise la clé publique par défaut de FCM.
  const vapidKey = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || undefined;
  return getToken(getMessaging(), { serviceWorkerRegistration: registration, vapidKey });
}

async function saveToken(uid: string, token: string): Promise<string> {
  const tokenId = await pushTokenId(token);
  const ref = doc(db, paths.pushTokens(uid), tokenId);
  const userAgent = navigator.userAgent.slice(0, 500);
  if ((await getDoc(ref)).exists()) {
    await updateDoc(ref, { token, userAgent, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, {
      token,
      userAgent,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  writeStored(uid, { tokenId, syncedAt: Date.now() });
  return tokenId;
}

export class PushPermissionError extends Error {}

export async function enablePush(uid: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushPermissionError(
      "Notifications refusées : autorise-les pour ce site dans les réglages du navigateur.",
    );
  }
  await saveToken(uid, await currentToken());
}

export async function disablePush(uid: string): Promise<void> {
  const stored = readStored(uid);
  if (stored) await deleteDoc(doc(db, paths.pushTokens(uid), stored.tokenId));
  writeStored(uid, null);
  if (!usingEmulators) {
    const { deleteToken, getMessaging } = await import("firebase/messaging");
    await deleteToken(getMessaging()).catch(() => undefined);
  }
}

/** Déconnexion : ce compte ne reçoit plus rien ici (le token FCM reste, il peut servir à un autre). */
export async function forgetPushDevice(uid: string): Promise<void> {
  const stored = readStored(uid);
  if (!stored) return;
  await deleteDoc(doc(db, paths.pushTokens(uid), stored.tokenId));
  writeStored(uid, null);
}

/** Renouvelle le token de cet appareil s'il est activé (appelé au chargement de l'app). */
export async function refreshPush(uid: string): Promise<void> {
  const stored = readStored(uid);
  if (!stored || !("Notification" in window)) return;
  if (Notification.permission !== "granted") {
    // Permission retirée dans le navigateur : l'appareil ne recevra plus rien.
    await deleteDoc(doc(db, paths.pushTokens(uid), stored.tokenId)).catch(() => undefined);
    writeStored(uid, null);
    return;
  }
  if (Date.now() - stored.syncedAt < REFRESH_EVERY_MS) return;
  const tokenId = await saveToken(uid, await currentToken());
  if (tokenId !== stored.tokenId) {
    await deleteDoc(doc(db, paths.pushTokens(uid), stored.tokenId)).catch(() => undefined);
  }
}

/** État de l'interrupteur « Notifications sur cet appareil ». */
export function usePush(uid: string | undefined) {
  const [state, setState] = useState<PushState>("loading");

  const load = useCallback(async () => {
    if (!uid) return;
    const supported = await support();
    if (supported !== "ok") return setState(supported);
    if (Notification.permission === "denied") return setState("denied");
    const stored = readStored(uid);
    const active =
      stored !== null &&
      Notification.permission === "granted" &&
      (await getDoc(doc(db, paths.pushTokens(uid), stored.tokenId))).exists();
    setState(active ? "on" : "off");
  }, [uid]);

  useEffect(() => {
    load().catch(() => setState("unsupported"));
  }, [load]);

  const enable = useCallback(async () => {
    if (!uid) return;
    try {
      await enablePush(uid);
    } finally {
      await load();
    }
  }, [uid, load]);

  const disable = useCallback(async () => {
    if (!uid) return;
    try {
      await disablePush(uid);
    } finally {
      await load();
    }
  }, [uid, load]);

  return { state, enable, disable };
}

/** À monter une fois dans l'espace connecté : garde le token de l'appareil à jour. */
export function usePushRefresh(uid: string | undefined) {
  useEffect(() => {
    if (!uid) return;
    refreshPush(uid).catch(() => undefined);
  }, [uid]);
}
