import { applicationDefault } from "firebase-admin/app";
import { FieldValue } from "firebase-admin/firestore";
import { APP_HOSTING_BACKEND, REGION } from "@shared/constants";
import {
  dnsRecordsToFix,
  isDomainActive,
  type AppHostingDomain,
  type SchoolDomain,
} from "@shared/domains";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";

/**
 * Domaine personnalisé d'une école : ajouté au backend App Hosting (certificat HTTPS
 * automatique), puis aux domaines autorisés d'Authentication une fois actif.
 * domains/{host} = { schoolId } sert au routage (src/middleware.ts).
 */

/** Erreur au message déjà lisible par le formateur. */
export class DomainError extends Error {}

export interface DomainsClient {
  create(host: string): Promise<void>;
  get(host: string): Promise<AppHostingDomain | null>;
  remove(host: string): Promise<void>;
  /** Ajoute le domaine aux domaines autorisés d'Authentication. */
  authorize(host: string): Promise<void>;
}

function projectId(): string {
  const id =
    process.env.GCLOUD_PROJECT ??
    (JSON.parse(process.env.FIREBASE_CONFIG ?? "{}") as { projectId?: string }).projectId;
  if (!id) throw new Error("Projet Google Cloud inconnu");
  return id;
}

async function googleApi(method: string, url: string, body?: unknown): Promise<Response> {
  const { access_token: token } = await applicationDefault().getAccessToken();
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function apiError(response: Response): Promise<Error> {
  const text = await response.text();
  return new Error(`App Hosting ${response.status} : ${text.slice(0, 300)}`);
}

const domainsUrl = () =>
  `https://firebaseapphosting.googleapis.com/v1/projects/${projectId()}/locations/${REGION}/backends/${APP_HOSTING_BACKEND}/domains`;

export const appHostingDomains: DomainsClient = {
  async create(host) {
    const response = await googleApi(
      "POST",
      `${domainsUrl()}?domainId=${encodeURIComponent(host)}`,
      {},
    );
    if (response.status === 409) return; // déjà relié au backend
    if (!response.ok) throw await apiError(response);
  },
  async get(host) {
    const response = await googleApi("GET", `${domainsUrl()}/${encodeURIComponent(host)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as AppHostingDomain;
  },
  async remove(host) {
    const response = await googleApi("DELETE", `${domainsUrl()}/${encodeURIComponent(host)}`);
    if (response.status === 404) return;
    if (!response.ok) throw await apiError(response);
  },
  async authorize(host) {
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId()}/config`;
    const current = await googleApi("GET", url);
    if (!current.ok) throw await apiError(current);
    const config = (await current.json()) as { authorizedDomains?: string[] };
    const domains = new Set(config.authorizedDomains ?? []);
    if (domains.has(host)) return;
    domains.add(host);
    const response = await googleApi("PATCH", `${url}?updateMask=authorizedDomains`, {
      authorizedDomains: [...domains],
    });
    if (!response.ok) throw await apiError(response);
  },
};

/**
 * App Hosting simulé (émulateurs, DOMAINS_FAKE=true) : un domaine commençant par « actif. »
 * est actif tout de suite, les autres restent en attente de DNS.
 */
const fakeStore = new Set<string>();
export const fakeDomains: DomainsClient = {
  async create(host) {
    fakeStore.add(host);
  },
  async get(host) {
    if (!fakeStore.has(host)) return null;
    if (host.startsWith("actif.")) {
      return { customDomainStatus: { hostState: "HOST_ACTIVE", certState: "CERT_ACTIVE" } };
    }
    return {
      customDomainStatus: {
        hostState: "HOST_UNHOSTED",
        certState: "CERT_PREPARING",
        requiredDnsUpdates: [
          {
            desired: [
              {
                records: [
                  { type: "A", domainName: host, rdata: "35.219.200.11", requiredAction: "ADD" },
                  { type: "TXT", domainName: host, rdata: "fah-claim=demo", requiredAction: "ADD" },
                ],
              },
            ],
          },
        ],
      },
    };
  },
  async remove(host) {
    fakeStore.delete(host);
  },
  async authorize() {},
};

async function loadSchool(schoolId: string) {
  const ref = db().doc(`creators/${schoolId}`);
  const creator = (await ref.get()).data() as CreatorDoc | undefined;
  if (!creator) throw new DomainError("École introuvable");
  return { ref, creator };
}

/** Relit l'état du domaine chez App Hosting et met à jour la fiche de l'école. */
async function syncDomain(
  schoolId: string,
  host: string,
  client: DomainsClient,
  attempts = 1,
): Promise<SchoolDomain> {
  let domain: AppHostingDomain | null = null;
  // Juste après la création, le domaine et ses enregistrements DNS arrivent en quelques secondes.
  for (let attempt = 0; attempt < attempts; attempt++) {
    domain = await client.get(host);
    if (domain?.customDomainStatus?.requiredDnsUpdates?.length || isDomainActive(domain)) break;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const summary: SchoolDomain = {
    host,
    status: isDomainActive(domain) ? "active" : "pending",
    records: dnsRecordsToFix(domain),
    checkedAt: null,
  };
  const batch = db().batch();
  batch.set(db().doc(`domains/${host}`), { schoolId, status: summary.status });
  batch.update(db().doc(`creators/${schoolId}`), {
    customDomain: { ...summary, checkedAt: FieldValue.serverTimestamp() },
  });
  await batch.commit();
  if (summary.status === "active") await client.authorize(host);
  return summary;
}

export async function addSchoolDomain(
  schoolId: string,
  host: string,
  client: DomainsClient,
): Promise<SchoolDomain> {
  const { creator } = await loadSchool(schoolId);
  if (creator.customDomain && creator.customDomain.host !== host) {
    throw new DomainError(`Retire d'abord le domaine actuel (${creator.customDomain.host}).`);
  }
  const existing = (await db().doc(`domains/${host}`).get()).data() as
    { schoolId: string } | undefined;
  if (existing && existing.schoolId !== schoolId) {
    throw new DomainError("Ce domaine est déjà utilisé par une autre école.");
  }
  await client.create(host);
  return syncDomain(schoolId, host, client, 5);
}

export async function refreshSchoolDomain(
  schoolId: string,
  client: DomainsClient,
): Promise<SchoolDomain> {
  const { creator } = await loadSchool(schoolId);
  if (!creator.customDomain) throw new DomainError("Aucun domaine à vérifier.");
  return syncDomain(schoolId, creator.customDomain.host, client);
}

export async function removeSchoolDomain(schoolId: string, client: DomainsClient): Promise<void> {
  const { ref, creator } = await loadSchool(schoolId);
  const host = creator.customDomain?.host;
  if (!host) return;
  await client.remove(host);
  const batch = db().batch();
  batch.delete(db().doc(`domains/${host}`));
  batch.update(ref, { customDomain: FieldValue.delete() });
  await batch.commit();
}

/** Adresse des liens envoyés par email : domaine de l'école s'il est actif, sinon la plateforme. */
export async function schoolBaseUrl(schoolId: string, fallback: string): Promise<string> {
  const creator = (await db().doc(`creators/${schoolId}`).get()).data() as CreatorDoc | undefined;
  const domain = creator?.customDomain;
  return domain?.status === "active" ? `https://${domain.host}` : fallback;
}
