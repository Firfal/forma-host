/**
 * Prépare un projet Firebase de production pour Forma Host. Idempotent : chaque étape
 * vérifie l'existant avant d'agir, on peut relancer le script autant de fois que nécessaire.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=cle.json npx tsx scripts/bootstrap-firebase.ts --project forma-host
 *
 * Étapes : facturation (Blaze), APIs, base Firestore, Authentication (email + mot de passe,
 * domaines autorisés, emails en français), bucket Storage par défaut, secret Vimeo.
 * Le déploiement (règles, Functions, App Hosting) est fait ensuite par `firebase deploy`
 * (voir .github/workflows/deploy.yml).
 */
import { GoogleAuth } from "google-auth-library";
import { REGION } from "../shared/constants";
import { parseArgs } from "./admin";

const args = parseArgs();
const PROJECT = typeof args.project === "string" ? args.project : process.env.GCLOUD_PROJECT;
if (!PROJECT) throw new Error("Préciser --project <id>");
const BACKEND_ID = typeof args.backend === "string" ? args.backend : "forma-host";
const APP_DOMAIN = `${BACKEND_ID}--${PROJECT}.${REGION}.hosted.app`;

const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });

interface ApiError extends Error {
  status: number;
  body: unknown;
}

async function api<T = Record<string, unknown>>(
  method: string,
  url: string,
  body?: unknown,
  { allow404 = false } = {},
): Promise<T | null> {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-goog-user-project": PROJECT!,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? (JSON.parse(text) as T) : ({} as T);
  if (response.status === 404 && allow404) return null;
  if (!response.ok) {
    const error = new Error(
      `${method} ${url} → ${response.status} ${text.slice(0, 500)}`,
    ) as ApiError;
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

/** Attend la fin d'une opération longue (LRO) Google Cloud. */
async function waitOperation(baseUrl: string, operation: { name?: string; done?: boolean }) {
  let current = operation;
  for (let attempt = 0; attempt < 90 && !current.done && current.name; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    current = (await api<{ name: string; done?: boolean; error?: unknown }>(
      "GET",
      `${baseUrl}/${current.name}`,
    ))!;
  }
  const error = (current as { error?: unknown }).error;
  if (error) throw new Error(`Opération en échec : ${JSON.stringify(error)}`);
  return current;
}

const ok = (message: string) => console.log(`✔ ${message}`);
const info = (message: string) => console.log(`• ${message}`);
const warnings: string[] = [];
const warn = (message: string) => {
  warnings.push(message);
  console.log(`⚠ ${message}`);
};

async function checkBilling() {
  const billing = await api<{ billingEnabled?: boolean }>(
    "GET",
    `https://cloudbilling.googleapis.com/v1/projects/${PROJECT}/billingInfo`,
  ).catch((error: ApiError) => {
    warn(`Impossible de vérifier la facturation (${error.status}).`);
    return null;
  });
  if (billing && !billing.billingEnabled) {
    throw new Error(
      `Le projet ${PROJECT} n'est pas en offre Blaze : Console Firebase > Paramètres > Utilisation et facturation > Modifier l'offre.`,
    );
  }
  if (billing) ok("Offre Blaze active");
}

const REQUIRED_APIS = [
  "firebase.googleapis.com",
  "firestore.googleapis.com",
  "firebaserules.googleapis.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "cloudfunctions.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "run.googleapis.com",
  "eventarc.googleapis.com",
  "pubsub.googleapis.com",
  "secretmanager.googleapis.com",
  "firebaseapphosting.googleapis.com",
  "firebaseextensions.googleapis.com",
  "cloudresourcemanager.googleapis.com",
  "iam.googleapis.com",
  "cloudbilling.googleapis.com",
];

async function enableApis() {
  const operation = await api<{ name?: string; done?: boolean }>(
    "POST",
    `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services:batchEnable`,
    { serviceIds: REQUIRED_APIS },
  ).catch((error: ApiError) => {
    if (/billing/i.test(error.message)) {
      throw new Error(
        `Le projet ${PROJECT} n'est pas en offre Blaze : Console Firebase > Paramètres > Utilisation et facturation > Modifier l'offre.`,
      );
    }
    throw error;
  });
  await waitOperation("https://serviceusage.googleapis.com/v1", operation!);
  ok(`APIs activées (${REQUIRED_APIS.length})`);
}

async function ensureFirestore() {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases`;
  const existing = await api<{ locationId: string; type: string }>(
    "GET",
    `${base}/(default)`,
    undefined,
    {
      allow404: true,
    },
  );
  if (existing) {
    if (existing.locationId !== REGION) {
      warn(
        `Firestore existe déjà en ${existing.locationId} (et non ${REGION}) : c'est définitif, on continue avec.`,
      );
    } else ok(`Firestore (default) en ${existing.locationId}`);
    return;
  }
  info(`Création de la base Firestore en ${REGION}…`);
  const operation = await api<{ name?: string; done?: boolean }>(
    "POST",
    `${base}?databaseId=(default)`,
    {
      locationId: REGION,
      type: "FIRESTORE_NATIVE",
    },
  );
  await waitOperation("https://firestore.googleapis.com/v1", operation!);
  ok(`Firestore (default) créée en ${REGION}`);
}

interface AuthConfig {
  authorizedDomains?: string[];
  signIn?: { email?: { enabled?: boolean; passwordRequired?: boolean } };
  notification?: { defaultLocale?: string };
}

async function ensureAuth() {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
  const config = await api<AuthConfig>("GET", base, undefined, { allow404: true }).catch(
    (error: ApiError) => {
      if (error.status === 400 || error.status === 404) return null;
      throw error;
    },
  );
  if (!config) {
    // On n'initialise pas via l'API : elle passerait le projet à Identity Platform (irréversible).
    warn(
      `Authentication pas encore activé : https://console.firebase.google.com/project/${PROJECT}/authentication ` +
        `> « Commencer » > « Adresse e-mail/Mot de passe », puis relancer le déploiement.`,
    );
    return;
  }
  const domains = new Set(config?.authorizedDomains ?? []);
  ["localhost", `${PROJECT}.firebaseapp.com`, `${PROJECT}.web.app`, APP_DOMAIN].forEach((d) =>
    domains.add(d),
  );
  if (typeof args.domain === "string") domains.add(args.domain);
  await api(
    "PATCH",
    `${base}?updateMask=signIn.email.enabled,signIn.email.passwordRequired,authorizedDomains,notification.defaultLocale`,
    {
      signIn: { email: { enabled: true, passwordRequired: true } },
      authorizedDomains: [...domains],
      notification: { defaultLocale: "fr" },
    },
  );
  ok(
    `Authentication : email + mot de passe, emails en français, domaines ${[...domains].join(", ")}`,
  );
}

async function ensureStorage() {
  const url = `https://firebasestorage.googleapis.com/v1alpha/projects/${PROJECT}/defaultBucket`;
  const existing = await api<{ bucket?: { name?: string }; location?: string }>(
    "GET",
    url,
    undefined,
    {
      allow404: true,
    },
  );
  if (existing?.bucket?.name) {
    ok(`Bucket Storage : ${existing.bucket.name.split("/").pop()} (${existing.location ?? "?"})`);
    return;
  }
  info(`Création du bucket Storage par défaut en ${REGION}…`);
  try {
    const created = await api<{ bucket?: { name?: string } }>("POST", url, { location: REGION });
    ok(`Bucket Storage créé : ${created?.bucket?.name?.split("/").pop() ?? "(default)"}`);
  } catch (error) {
    warn(
      `Bucket Storage non créé automatiquement (${(error as ApiError).status}). ` +
        `Ouvre https://console.firebase.google.com/project/${PROJECT}/storage, clique « Commencer », région ${REGION}.`,
    );
  }
}

/** Le secret doit exister pour déployer resolveVimeoVideo ; valeur « unset » tant qu'il n'y a pas de token. */
async function ensureVimeoSecret() {
  const base = `https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets`;
  const token = process.env.VIMEO_ACCESS_TOKEN?.trim();
  const existing = await api("GET", `${base}/VIMEO_ACCESS_TOKEN`, undefined, { allow404: true });
  if (existing && !token) {
    ok("Secret VIMEO_ACCESS_TOKEN présent");
    return;
  }
  if (!existing) {
    await api("POST", `${base}?secretId=VIMEO_ACCESS_TOKEN`, {
      replication: { automatic: {} },
      labels: { "firebase-managed": "true" },
    });
  }
  await api("POST", `${base}/VIMEO_ACCESS_TOKEN:addVersion`, {
    payload: { data: Buffer.from(token || "unset").toString("base64") },
  });
  ok(
    token
      ? "Secret VIMEO_ACCESS_TOKEN mis à jour"
      : "Secret VIMEO_ACCESS_TOKEN créé (vide pour l'instant)",
  );
}

/** Le serveur Next.js (App Hosting) lit les pages de vente dans Firestore avec l'Admin SDK. */
async function grantAppHostingFirestoreAccess() {
  const member = `serviceAccount:firebase-app-hosting-compute@${PROJECT}.iam.gserviceaccount.com`;
  const role = "roles/datastore.user";
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}`;
  const serviceAccount = await api(
    "GET",
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/firebase-app-hosting-compute@${PROJECT}.iam.gserviceaccount.com`,
    undefined,
    { allow404: true },
  );
  if (!serviceAccount) {
    info(
      "Compte de service App Hosting pas encore créé (il le sera au premier déploiement) : relancer ensuite.",
    );
    return;
  }
  const policy = (await api<{ bindings?: { role: string; members: string[] }[]; etag?: string }>(
    "POST",
    `${url}:getIamPolicy`,
    {},
  ))!;
  const binding = policy.bindings?.find((b) => b.role === role);
  if (binding?.members.includes(member)) {
    ok("App Hosting : accès Firestore déjà accordé");
    return;
  }
  if (binding) binding.members.push(member);
  else (policy.bindings ??= []).push({ role, members: [member] });
  await api("POST", `${url}:setIamPolicy`, { policy });
  ok("App Hosting : accès Firestore accordé (roles/datastore.user)");
}

async function main() {
  console.log(`\nProjet ${PROJECT} — région ${REGION} — backend ${APP_DOMAIN}\n`);
  await enableApis();
  await checkBilling();
  await ensureFirestore();
  await ensureAuth();
  await ensureStorage();
  await ensureVimeoSecret();
  await grantAppHostingFirestoreAccess();
  console.log(
    warnings.length ? `\nTerminé avec ${warnings.length} avertissement(s).` : "\nTerminé.",
  );
  if (process.env.GITHUB_STEP_SUMMARY && warnings.length) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Avertissements\n${warnings.map((w) => `- ${w}`).join("\n")}\n`,
    );
  }
}

main().catch((error) => {
  console.error(`✘ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
