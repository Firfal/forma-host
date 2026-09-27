import { applicationDefault } from "firebase-admin/app";
import { FieldValue, type WriteBatch } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { APP_HOSTING_BACKEND, REGION } from "@shared/constants";
import {
  detectDnsProvider,
  normalizeDnsValue,
  registrableDomain,
  summarizeDomain,
  type AppHostingDomain,
  type AppHostingOperation,
  type DnsProviderId,
  type DomainDnsRecord,
  type SchoolDomain,
} from "@shared/domains";
import { routes } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";
import { brandFromCreator, mailDoc } from "./mail";

/**
 * Domaine personnalisé d'une école : ajouté au backend App Hosting (certificat HTTPS
 * automatique), puis aux domaines autorisés d'Authentication une fois actif.
 * domains/{host} = { schoolId, status, operation } sert au routage (src/middleware.ts) ;
 * operation est l'opération de création, qui porte les enregistrements DNS à créer.
 */

/** Erreur au message déjà lisible par le formateur. */
export class DomainError extends Error {}

export interface DomainsClient {
  /** Relie le domaine au backend ; retourne le nom de l'opération de création. */
  create(host: string): Promise<string | null>;
  get(host: string): Promise<AppHostingDomain | null>;
  operation(name: string): Promise<AppHostingOperation | null>;
  /** Opération de création d'un domaine déjà relié (domaines ajoutés avant son suivi). */
  findOperation(host: string): Promise<string | null>;
  remove(host: string): Promise<void>;
  /** Ajoute le domaine aux domaines autorisés d'Authentication. */
  authorize(host: string): Promise<void>;
  /** Valeurs publiées dans le DNS public (null : résolution impossible). */
  resolve(name: string, type: string): Promise<string[] | null>;
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

const API = "https://firebaseapphosting.googleapis.com/v1";
const locationPath = () => `projects/${projectId()}/locations/${REGION}`;
const domainsUrl = () => `${API}/${locationPath()}/backends/${APP_HOSTING_BACKEND}/domains`;

/** Types DNS (RFC 1035…) des réponses de dns.google. */
const DNS_TYPES: Record<string, number> = { A: 1, NS: 2, CNAME: 5, TXT: 16, AAAA: 28, CAA: 257 };

export const appHostingDomains: DomainsClient = {
  async create(host) {
    const response = await googleApi(
      "POST",
      `${domainsUrl()}?domainId=${encodeURIComponent(host)}`,
      {},
    );
    if (response.status === 409) return null; // déjà relié au backend
    if (!response.ok) throw await apiError(response);
    const operation = (await response.json()) as AppHostingOperation;
    if (operation.done && operation.error) {
      throw new Error(`App Hosting : ${operation.error.message ?? "création refusée"}`);
    }
    return operation.name ?? null;
  },
  async get(host) {
    const response = await googleApi("GET", `${domainsUrl()}/${encodeURIComponent(host)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as AppHostingDomain;
  },
  async operation(name) {
    const response = await googleApi("GET", `${API}/${name}`);
    if (response.status === 404) return null;
    if (!response.ok) throw await apiError(response);
    return (await response.json()) as AppHostingOperation;
  },
  async findOperation(host) {
    const target = `/backends/${APP_HOSTING_BACKEND}/domains/${host}`;
    let best: AppHostingOperation | null = null;
    let pageToken = "";
    for (let page = 0; page < 10; page++) {
      const response = await googleApi(
        "GET",
        `${API}/${locationPath()}/operations?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      if (!response.ok) throw await apiError(response);
      const body = (await response.json()) as {
        operations?: AppHostingOperation[];
        nextPageToken?: string;
      };
      for (const operation of body.operations ?? []) {
        if (!operation.metadata?.target?.endsWith(target)) continue;
        if (operation.metadata.verb && operation.metadata.verb !== "create") continue;
        const newer =
          !best || (operation.metadata.createTime ?? "") > (best.metadata?.createTime ?? "");
        if (newer) best = operation;
      }
      if (!body.nextPageToken) break;
      pageToken = encodeURIComponent(body.nextPageToken);
    }
    return best?.name ?? null;
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
  async resolve(name, type) {
    try {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return null;
      const body = (await response.json()) as {
        Status?: number;
        Answer?: { type?: number; data?: string }[];
      };
      // 0 : réponse ; 3 : le nom n'existe pas (encore). Le reste : serveur DNS en erreur.
      if (body.Status !== 0 && body.Status !== 3) return null;
      return (body.Answer ?? [])
        .filter((answer) => answer.type === DNS_TYPES[type])
        .map((answer) => normalizeDnsValue(type, answer.data ?? ""));
    } catch {
      return null;
    }
  },
};

/**
 * App Hosting simulé (émulateurs, DOMAINS_FAKE=true). Comme l'API réelle, le domaine n'a pas
 * encore d'enregistrements juste après sa création : ils sont dans l'opération.
 * - « actif.… » : actif tout de suite ;
 * - « verif.… » : enregistrements déjà publiés, vérification en cours ;
 * - autres : rien de configuré (activables avec fakeActivate).
 */
const fakeStore = new Map<string, { active: boolean }>();
const FAKE_IP = "35.219.200.11";
const fakeRecords = (host: string) => [
  { type: "A", domainName: `${host}.`, rdata: FAKE_IP, relevantState: ["HOST_STATE"] },
  {
    type: "TXT",
    domainName: `${host}.`,
    rdata: "fah-claim=demo",
    relevantState: ["OWNERSHIP_STATE"],
  },
  {
    type: "CNAME",
    domainName: `_acme-challenge_demo.${host}.`,
    rdata: "demo.authorize.certificatemanager.goog.",
    relevantState: ["CERT_STATE"],
  },
];
const fakeStates = (host: string) =>
  fakeStore.get(host)?.active
    ? { hostState: "HOST_ACTIVE", ownershipState: "OWNERSHIP_ACTIVE", certState: "CERT_ACTIVE" }
    : host.startsWith("verif.")
      ? {
          hostState: "HOST_ACTIVE",
          ownershipState: "OWNERSHIP_PENDING",
          certState: "CERT_VALIDATING",
        }
      : {
          hostState: "HOST_UNHOSTED",
          ownershipState: "OWNERSHIP_MISSING",
          certState: "CERT_PREPARING",
        };

export function fakeActivate(host: string) {
  if (fakeStore.has(host)) fakeStore.set(host, { active: true });
}

export const fakeDomains: DomainsClient = {
  async create(host) {
    if (!fakeStore.has(host)) fakeStore.set(host, { active: host.startsWith("actif.") });
    return `operations/fake-${host}`;
  },
  async get(host) {
    return fakeStore.has(host) ? { customDomainStatus: fakeStates(host) } : null;
  },
  async operation(name) {
    const host = name.replace("operations/fake-", "");
    if (!fakeStore.has(host)) return null;
    const configured = host.startsWith("verif.");
    return {
      name,
      done: Boolean(fakeStore.get(host)?.active),
      metadata: {
        target: `backends/forma-host/domains/${host}`,
        verb: "create",
        customDomainOperationMetadata: {
          ...fakeStates(host),
          quickSetupUpdates: [
            {
              desired: [
                {
                  records: fakeRecords(host).map((record) => ({
                    ...record,
                    requiredAction: configured ? "NONE" : "ADD",
                  })),
                },
              ],
            },
          ],
        },
      },
    };
  },
  async findOperation(host) {
    return fakeStore.has(host) ? `operations/fake-${host}` : null;
  },
  async remove(host) {
    fakeStore.delete(host);
  },
  async authorize() {},
  async resolve(name, type) {
    // Tous les domaines de démonstration sont « chez IONOS ».
    if (type === "NS") return ["ns1045.ui-dns.com"];
    const host = [...fakeStore.keys()].find((key) => name === key || name.endsWith(`.${key}`));
    if (!host || !host.startsWith("verif.")) return [];
    return fakeRecords(host)
      .filter((record) => record.type === type && record.domainName === `${name}.`)
      .map((record) => normalizeDnsValue(type, record.rdata));
  },
};

async function loadSchool(schoolId: string) {
  const ref = db().doc(`creators/${schoolId}`);
  const creator = (await ref.get()).data() as CreatorDoc | undefined;
  if (!creator) throw new DomainError("École introuvable");
  return { ref, creator };
}

/** Vérifie dans le DNS public les enregistrements que le formateur doit créer ou supprimer. */
async function checkPublicDns(
  records: DomainDnsRecord[],
  client: DomainsClient,
): Promise<DomainDnsRecord[]> {
  const lookups = new Map<string, Promise<string[] | null>>();
  const lookup = (name: string, type: string) => {
    const key = `${type}|${name}`;
    if (!lookups.has(key)) lookups.set(key, client.resolve(name, type));
    return lookups.get(key)!;
  };
  return Promise.all(
    records.map(async (record) => {
      if (record.action === "ok") return { ...record, found: true };
      const values = await lookup(record.name, record.type);
      return {
        ...record,
        found: values ? values.includes(normalizeDnsValue(record.type, record.value)) : null,
      };
    }),
  );
}

async function dnsProviderOf(host: string, client: DomainsClient): Promise<DnsProviderId | null> {
  const nameservers = await client.resolve(registrableDomain(host), "NS");
  return nameservers ? detectDnsProvider(nameservers) : null;
}

/** Relit l'état du domaine chez App Hosting et dans le DNS public, puis met à jour l'école. */
async function syncDomain(
  schoolId: string,
  host: string,
  client: DomainsClient,
  options: { attempts?: number; appUrl?: string } = {},
): Promise<SchoolDomain> {
  const routingRef = db().doc(`domains/${host}`);
  const routing = (await routingRef.get()).data() as { operation?: string | null } | undefined;
  let operationName = routing?.operation ?? null;

  let domain = await client.get(host);
  if (!domain) {
    // Domaine absent d'App Hosting (création échouée ou supprimé à la main) : on le relie à nouveau.
    operationName = (await client.create(host)) ?? operationName;
    domain = await client.get(host);
  }
  if (!operationName) operationName = await client.findOperation(host);

  let summary = summarizeDomain(domain, null);
  const attempts = options.attempts ?? 1;
  // Juste après la création, l'opération reçoit ses enregistrements DNS en quelques secondes.
  for (let attempt = 0; attempt < attempts; attempt++) {
    const operation = operationName ? await client.operation(operationName) : null;
    summary = summarizeDomain(domain, operation);
    if (summary.records.length || summary.status === "active") break;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      domain = await client.get(host);
    }
  }

  const pending = summary.status === "pending";
  const [records, dnsProvider] = pending
    ? await Promise.all([checkPublicDns(summary.records, client), dnsProviderOf(host, client)])
    : [[], null];

  const { creator } = await loadSchool(schoolId);
  const becameActive = !pending && creator.customDomain?.status !== "active";
  const batch = db().batch();
  batch.set(routingRef, { schoolId, status: summary.status, operation: operationName });
  batch.update(db().doc(`creators/${schoolId}`), {
    customDomain: {
      host,
      ...summary,
      records,
      dnsProvider,
      checkedAt: FieldValue.serverTimestamp(),
      activeAt: pending
        ? null
        : becameActive
          ? FieldValue.serverTimestamp()
          : (creator.customDomain?.activeAt ?? FieldValue.serverTimestamp()),
    },
  });
  if (becameActive && options.appUrl) {
    notifyDomainActive(batch, schoolId, creator, host, options.appUrl, await ownerEmail(schoolId));
  }
  await batch.commit();
  if (!pending) await client.authorize(host);
  return { host, ...summary, records, dnsProvider, checkedAt: null, activeAt: null };
}

async function ownerEmail(schoolId: string): Promise<string | null> {
  const user = (await db().doc(`users/${schoolId}`).get()).data() as { email?: string } | undefined;
  return user?.email ?? null;
}

/** Domaine actif : notification et email au propriétaire de l'école. */
function notifyDomainActive(
  batch: WriteBatch,
  schoolId: string,
  creator: CreatorDoc,
  host: string,
  appUrl: string,
  email: string | null,
) {
  const url = `https://${host}`;
  batch.set(db().doc(`users/${schoolId}/notifications/domain_active`), {
    type: "domain_active",
    title: "Ton école est en ligne sur ton domaine",
    body: `${creator.name} est accessible sur ${host}.`,
    link: routes.adminSettings,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (!email) return;
  const brand = brandFromCreator(creator);
  const paragraphs = [
    `Bonne nouvelle : ton école « ${creator.name} » est maintenant en ligne sur ${host}, avec un certificat HTTPS.`,
    "Si tes vidéos Vimeo sont limitées à certains sites, ajoute aussi ce domaine dans leurs réglages d'intégration.",
  ];
  batch.set(
    db().doc(`mail/domain_active_${schoolId}_${Date.now()}`),
    mailDoc({
      creatorId: schoolId,
      to: email,
      subject: `${host} est en ligne`,
      html: emailLayout({
        bodyHtml: paragraphs
          .map((text) => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`)
          .join(""),
        ctaLabel: "Ouvrir mon école",
        ctaUrl: url,
        brandName: brand.name,
        brandColor: brand.color,
      }),
      text: `${paragraphs.join("\n\n")}\n\nOuvrir mon école : ${url}\nParamètres : ${appUrl}${routes.adminSettings}`,
      replyTo: brand.supportEmail,
    }),
  );
}

export async function addSchoolDomain(
  schoolId: string,
  host: string,
  client: DomainsClient,
  appUrl?: string,
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
  const operation = await client.create(host);
  if (operation) {
    await db().doc(`domains/${host}`).set({ schoolId, status: "pending", operation });
  }
  return syncDomain(schoolId, host, client, { attempts: 5, appUrl });
}

export async function refreshSchoolDomain(
  schoolId: string,
  client: DomainsClient,
  appUrl?: string,
): Promise<SchoolDomain> {
  const { creator } = await loadSchool(schoolId);
  if (!creator.customDomain) throw new DomainError("Aucun domaine à vérifier.");
  return syncDomain(schoolId, creator.customDomain.host, client, { appUrl });
}

/** Vérification planifiée des domaines en attente : le formateur n'a rien à relancer. */
export async function syncPendingDomains(
  client: DomainsClient,
  appUrl: string,
): Promise<{ checked: number; activated: number; failed: number }> {
  const snap = await db()
    .collection("creators")
    .where("customDomain.status", "==", "pending")
    .get();
  const result = { checked: 0, activated: 0, failed: 0 };
  for (const doc of snap.docs) {
    const host = (doc.data() as CreatorDoc).customDomain?.host;
    if (!host) continue;
    try {
      const domain = await syncDomain(doc.id, host, client, { appUrl });
      result.checked += 1;
      if (domain.status === "active") result.activated += 1;
    } catch (error) {
      result.failed += 1;
      logger.error(`Domaine ${host}`, error);
    }
  }
  return result;
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
