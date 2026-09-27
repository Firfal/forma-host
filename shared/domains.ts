import { z } from "zod";

/** Domaine personnalisé d'une école (Paramètres > Domaine), relié au backend App Hosting. */

const RESERVED_SUFFIXES = [".hosted.app", ".firebaseapp.com", ".web.app", ".run.app", ".local"];

export const schoolDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, "").replace(/[/?#].*$/, ""))
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^(?=.*[a-z])[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
        "Adresse invalide : saisis par exemple formation.ecolemotion.com",
      )
      .refine(
        (host) => !RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix)),
        "Cette adresse ne peut pas être utilisée",
      ),
  );

export const schoolDomainInput = z.object({ host: schoolDomainSchema });
export type SchoolDomainInput = z.infer<typeof schoolDomainInput>;

/** Suffixes à deux niveaux les plus courants : ailleurs, le domaine acheté est « nom.tld ». */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.mx",
  "co.jp",
  "co.za",
  "com.tr",
  "co.in",
  "com.es",
  "com.pt",
  "asso.fr",
  "gouv.fr",
]);

/** Domaine acheté chez le registrar : ecolemotion.com pour formation.ecolemotion.com. */
export function registrableDomain(host: string): string {
  const labels = host.split(".");
  const size = labels.length > 2 && TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.slice(-size).join(".");
}

/** Nom à saisir dans la zone DNS : « formation », « _acme-challenge_x.formation », « @ » (racine). */
export function relativeRecordName(name: string, zone: string): string {
  if (name === zone) return "@";
  return name.endsWith(`.${zone}`) ? name.slice(0, -zone.length - 1) : name;
}

/** Rôle d'un enregistrement : diriger l'adresse, prouver la propriété, autoriser le certificat. */
export type DnsRecordPurpose = "host" | "ownership" | "cert" | "other";

export interface DomainDnsRecord {
  type: string;
  /** Nom complet, sans point final. */
  name: string;
  value: string;
  /** add : à créer ; remove : à supprimer ; ok : en place (confirmé par App Hosting). */
  action: "add" | "remove" | "ok";
  purpose?: DnsRecordPurpose;
  /** Présent dans le DNS public à la dernière vérification (null : vérification impossible). */
  found?: boolean | null;
}

export type SchoolDomainStatus = "pending" | "active";

/** Hébergeurs DNS reconnus à leurs serveurs de noms, pour un guide adapté. */
export type DnsProviderId =
  | "ionos"
  | "ovh"
  | "gandi"
  | "cloudflare"
  | "godaddy"
  | "hostinger"
  | "squarespace"
  | "namecheap"
  | "o2switch"
  | "lws"
  | "route53"
  | "wix";

/** creators/{id}.customDomain : lisible publiquement (les enregistrements DNS ne sont pas secrets). */
export interface SchoolDomain<T = unknown> {
  host: string;
  status: SchoolDomainStatus;
  records: DomainDnsRecord[];
  /** États App Hosting (HOST_ACTIVE, OWNERSHIP_PENDING, CERT_VALIDATING…). */
  hostState?: string | null;
  ownershipState?: string | null;
  certState?: string | null;
  /** Problèmes signalés par App Hosting (en anglais), affichés dans le détail technique. */
  issues?: string[];
  dnsProvider?: DnsProviderId | null;
  checkedAt: T;
  activeAt?: T | null;
}

interface ApiStatus {
  code?: number;
  message?: string;
}

interface ApiDnsRecord {
  type?: string;
  domainName?: string;
  rdata?: string;
  requiredAction?: string;
  relevantState?: string[];
}

export interface ApiDnsUpdates {
  domainName?: string;
  desired?: { records?: ApiDnsRecord[]; checkError?: ApiStatus }[];
  discovered?: { records?: ApiDnsRecord[]; checkError?: ApiStatus }[];
  checkTime?: string;
}

interface ApiDomainStates {
  hostState?: string;
  ownershipState?: string;
  certState?: string;
  issues?: ApiStatus[];
}

/** Domaine App Hosting (champs utiles). */
export interface AppHostingDomain {
  customDomainStatus?: ApiDomainStates & { requiredDnsUpdates?: ApiDnsUpdates[] };
}

/**
 * Opération de création du domaine : elle reste en cours jusqu'à l'activation et porte les
 * enregistrements à créer (quickSetupUpdates) avant même la première vérification DNS du domaine.
 */
export interface AppHostingOperation {
  name?: string;
  done?: boolean;
  error?: ApiStatus;
  metadata?: {
    target?: string;
    verb?: string;
    createTime?: string;
    customDomainOperationMetadata?: ApiDomainStates & { quickSetupUpdates?: ApiDnsUpdates[] };
  };
}

const PURPOSE_BY_STATE: Record<string, DnsRecordPurpose> = {
  HOST_STATE: "host",
  OWNERSHIP_STATE: "ownership",
  CERT_STATE: "cert",
};
const PURPOSE_ORDER: DnsRecordPurpose[] = ["host", "ownership", "cert", "other"];

function recordPurpose(record: ApiDnsRecord, type: string, name: string, value: string) {
  const fromState = record.relevantState?.map((state) => PURPOSE_BY_STATE[state]).find(Boolean);
  if (fromState) return fromState;
  if (type === "A" || type === "AAAA") return "host";
  if (type === "TXT" && value.startsWith("fah-claim")) return "ownership";
  if (name.startsWith("_acme-challenge") || type === "CAA") return "cert";
  return "other";
}

/**
 * Enregistrements DNS attendus par App Hosting : à créer, déjà en place, ou à supprimer
 * (enregistrements existants en conflit), sans doublon.
 */
export function dnsRecordsFrom(updates: ApiDnsUpdates[] | undefined): DomainDnsRecord[] {
  const byKey = new Map<string, DomainDnsRecord>();
  const add = (record: ApiDnsRecord, desired: boolean) => {
    const action =
      record.requiredAction === "ADD"
        ? "add"
        : record.requiredAction === "REMOVE"
          ? "remove"
          : desired
            ? "ok"
            : null;
    // Un enregistrement découvert sans action est déjà listé parmi ceux attendus.
    if (!action || !record.type || !record.domainName) return;
    const name = record.domainName.replace(/\.$/, "").toLowerCase();
    const value = record.rdata ?? "";
    const key = `${record.type}|${name}|${value}`;
    const existing = byKey.get(key);
    if (existing && existing.action !== "ok") return;
    byKey.set(key, {
      type: record.type,
      name,
      value,
      action,
      purpose: recordPurpose(record, record.type, name, value),
    });
  };
  for (const update of updates ?? []) {
    for (const set of update.desired ?? [])
      for (const record of set.records ?? []) add(record, true);
    for (const set of update.discovered ?? [])
      for (const record of set.records ?? []) add(record, false);
  }
  const rank = (record: DomainDnsRecord) =>
    (record.action === "remove" ? 10 : 0) + PURPOSE_ORDER.indexOf(record.purpose ?? "other");
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b));
}

/** Servi en HTTPS : hébergé, propriété confirmée et certificat valide. */
export function isActiveState(states: ApiDomainStates | null | undefined): boolean {
  if (!states) return false;
  return (
    states.hostState === "HOST_ACTIVE" &&
    (!states.ownershipState || states.ownershipState === "OWNERSHIP_ACTIVE") &&
    (states.certState === "CERT_ACTIVE" || states.certState === "CERT_EXPIRING_SOON")
  );
}

export function isDomainActive(domain: AppHostingDomain | null | undefined): boolean {
  return isActiveState(domain?.customDomainStatus);
}

export type DomainSummary = Pick<
  SchoolDomain,
  "status" | "records" | "hostState" | "ownershipState" | "certState" | "issues"
>;

/**
 * État du domaine à partir du domaine App Hosting et de son opération de création : les
 * enregistrements du domaine (issus de sa vérification DNS) priment, sinon ceux de l'opération.
 */
export function summarizeDomain(
  domain: AppHostingDomain | null | undefined,
  operation: AppHostingOperation | null | undefined,
): DomainSummary {
  const fromDomain = domain?.customDomainStatus;
  const fromOperation = operation?.metadata?.customDomainOperationMetadata;
  const states = fromDomain?.hostState ? fromDomain : (fromOperation ?? fromDomain);
  const domainRecords = dnsRecordsFrom(fromDomain?.requiredDnsUpdates);
  const records = domainRecords.length
    ? domainRecords
    : dnsRecordsFrom(fromOperation?.quickSetupUpdates);
  const issues = [
    ...(fromDomain?.issues ?? []),
    ...(fromOperation?.issues ?? []),
    ...(operation?.done && operation.error ? [operation.error] : []),
  ]
    .map((issue) => (issue.message ?? "").trim().slice(0, 300))
    .filter(Boolean);
  const active = isActiveState(states);
  return {
    status: active ? "active" : "pending",
    records: active ? [] : records,
    hostState: states?.hostState ?? null,
    ownershipState: states?.ownershipState ?? null,
    certState: states?.certState ?? null,
    issues: [...new Set(issues)].slice(0, 5),
  };
}

/**
 * Étape du parcours affichée au formateur :
 * - preparing : enregistrements pas encore connus (quelques secondes après l'ajout) ;
 * - dns : des enregistrements restent à créer ou supprimer chez l'hébergeur ;
 * - verifying : DNS en place, App Hosting confirme l'adresse et la propriété ;
 * - certificate : adresse confirmée, certificat HTTPS en cours ;
 * - active : école en ligne sur son domaine.
 */
export type DomainPhase = "preparing" | "dns" | "verifying" | "certificate" | "active";

export function recordNeedsAction(record: DomainDnsRecord): boolean {
  if (record.action === "add") return record.found !== true;
  if (record.action === "remove") return record.found !== false;
  return false;
}

export function domainPhase(domain: Omit<DomainSummary, "issues">): DomainPhase {
  if (domain.status === "active") return "active";
  const hostActive = domain.hostState === "HOST_ACTIVE";
  if (domain.records.length === 0 && !hostActive) return "preparing";
  if (domain.records.some(recordNeedsAction)) return "dns";
  if (hostActive && (!domain.ownershipState || domain.ownershipState === "OWNERSHIP_ACTIVE")) {
    return "certificate";
  }
  return "verifying";
}

/** Guide par hébergeur : chemin vers la zone DNS et points d'attention. */
export interface DnsProviderGuide {
  name: string;
  nameservers: RegExp;
  url: string | null;
  path: string;
  tip?: string;
}

export const DNS_PROVIDERS: Record<DnsProviderId, DnsProviderGuide> = {
  ionos: {
    name: "IONOS",
    nameservers: /\.ui-dns\.(com|de|org|biz)$/,
    url: "https://my.ionos.fr/domains",
    path: "Domaines & SSL › ton domaine › DNS › Ajouter un enregistrement",
    tip: "Dans « Nom d'hôte », saisis seulement le nom court : IONOS ajoute ton domaine tout seul.",
  },
  ovh: {
    name: "OVHcloud",
    nameservers: /\.(ovh\.net|ovh\.ca|anycast\.me)$/,
    url: "https://www.ovh.com/manager/#/web/domain",
    path: "Web Cloud › Noms de domaine › ton domaine › Zone DNS › Ajouter une entrée",
  },
  gandi: {
    name: "Gandi",
    nameservers: /\.gandi\.net$/,
    url: "https://admin.gandi.net/domain/",
    path: "Noms de domaine › ton domaine › Enregistrements DNS › Ajouter un enregistrement",
  },
  cloudflare: {
    name: "Cloudflare",
    nameservers: /\.ns\.cloudflare\.com$/,
    url: "https://dash.cloudflare.com/",
    path: "ton domaine › DNS › Records › Add record",
    tip: "Règle « Proxy status » sur « DNS only » (nuage gris) : sinon le certificat HTTPS ne peut pas être créé.",
  },
  godaddy: {
    name: "GoDaddy",
    nameservers: /\.domaincontrol\.com$/,
    url: "https://dcc.godaddy.com/control/portfolio",
    path: "Mon portefeuille de domaines › ton domaine › DNS › Ajouter un nouvel enregistrement",
  },
  hostinger: {
    name: "Hostinger",
    nameservers: /\.dns-parking\.com$/,
    url: "https://hpanel.hostinger.com/domains",
    path: "Domaines › ton domaine › DNS / Serveurs de noms › Gérer les enregistrements DNS",
  },
  squarespace: {
    name: "Squarespace Domains",
    nameservers: /\.(googledomains\.com|squarespacedns\.com)$/,
    url: "https://account.squarespace.com/domains",
    path: "ton domaine › DNS › Enregistrements personnalisés › Ajouter un enregistrement",
  },
  namecheap: {
    name: "Namecheap",
    nameservers: /\.registrar-servers\.com$/,
    url: "https://ap.www.namecheap.com/domains/list/",
    path: "Domain List › Manage › Advanced DNS › Add new record",
  },
  o2switch: {
    name: "o2switch",
    nameservers: /\.o2switch\.net$/,
    url: null,
    path: "cPanel › Zone Editor › ton domaine › Gérer",
  },
  lws: {
    name: "LWS",
    nameservers: /\.lwsdns\.com$/,
    url: "https://panel.lws.fr/",
    path: "Mes domaines › ton domaine › Zone DNS",
  },
  route53: {
    name: "Amazon Route 53",
    nameservers: /\.awsdns-\d+\.(com|net|org|co\.uk)$/,
    url: "https://console.aws.amazon.com/route53/v2/hostedzones",
    path: "Hosted zones › ton domaine › Create record",
  },
  wix: {
    name: "Wix",
    nameservers: /\.wixdns\.net$/,
    url: "https://manage.wix.com/account/domains",
    path: "Domaines › ton domaine › Gérer les enregistrements DNS",
  },
};

/** Hébergeur DNS reconnu à partir des serveurs de noms du domaine. */
export function detectDnsProvider(nameservers: string[]): DnsProviderId | null {
  const hosts = nameservers.map((ns) => ns.toLowerCase().replace(/\.$/, ""));
  for (const [id, guide] of Object.entries(DNS_PROVIDERS) as [DnsProviderId, DnsProviderGuide][]) {
    if (hosts.some((host) => guide.nameservers.test(host))) return id;
  }
  return null;
}

/** Valeur telle que publiée dans le DNS : sans point final ni guillemets (TXT), en minuscules. */
export function normalizeDnsValue(type: string, value: string): string {
  const trimmed = value.trim().replace(/^"(.*)"$/, "$1");
  return type === "TXT" ? trimmed : trimmed.replace(/\.$/, "").toLowerCase();
}
