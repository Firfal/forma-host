import { FieldValue } from "firebase-admin/firestore";
import { paths } from "@shared/paths";
import type { VimeoSettingsDoc } from "@shared/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { db } from "./db";
import type { KeyProvider } from "./mail-settings";

/**
 * Token Vimeo d'une école : creators/{uid}/private/vimeo (compte, offre) lisible par le
 * formateur, creators/{uid}/secrets/vimeo (token chiffré) réservé aux Functions.
 */

export interface VimeoAccount {
  name: string | null;
  account: string | null;
}

/** Interroge l'API Vimeo avec le token ; remplaçable en test. */
export type VimeoMeFetcher = (token: string) => Promise<VimeoAccount>;

/** Erreur au message déjà lisible par le formateur. */
export class VimeoSetupError extends Error {}

const secretContext = (uid: string) => `vimeo:${uid}`;

export const fetchVimeoMe: VimeoMeFetcher = async (token) => {
  const response = await fetch("https://api.vimeo.com/me?fields=name,account", {
    headers: {
      Authorization: `bearer ${token}`,
      Accept: "application/vnd.vimeo.*+json;version=3.4",
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new VimeoSetupError(
      "Token refusé par Vimeo : vérifie qu'il est complet et encore actif.",
    );
  }
  if (!response.ok) throw new VimeoSetupError(`Vimeo : erreur ${response.status}`);
  const body = (await response.json()) as { name?: string; account?: string };
  return { name: body.name ?? null, account: body.account ?? null };
};

/** Vérifie le token auprès de Vimeo, puis l'enregistre chiffré. */
export async function saveVimeoSettings(
  uid: string,
  token: string,
  deps: { key: KeyProvider; fetchMe: VimeoMeFetcher },
): Promise<VimeoAccount> {
  const account = await deps.fetchMe(token);
  const batch = db().batch();
  batch.set(db().doc(paths.creatorVimeoSecret(uid)), {
    token: encryptSecret(token, deps.key(), secretContext(uid)),
  });
  batch.set(db().doc(paths.creatorVimeoSettings(uid)), {
    accountName: account.name,
    account: account.account,
    updatedAt: FieldValue.serverTimestamp(),
  } satisfies VimeoSettingsDoc<FieldValue>);
  await batch.commit();
  return account;
}

export async function deleteVimeoSettings(uid: string): Promise<void> {
  const batch = db().batch();
  batch.delete(db().doc(paths.creatorVimeoSettings(uid)));
  batch.delete(db().doc(paths.creatorVimeoSecret(uid)));
  await batch.commit();
}

/** Token de l'école, ou null si aucun compte Vimeo n'est relié. */
export async function loadVimeoToken(uid: string, key: KeyProvider): Promise<string | null> {
  const secret = (await db().doc(paths.creatorVimeoSecret(uid)).get()).data() as
    { token: string } | undefined;
  return secret ? decryptSecret(secret.token, key(), secretContext(uid)) : null;
}
