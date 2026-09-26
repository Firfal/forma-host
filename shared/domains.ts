import { z } from "zod";

/** Domaine personnalisé d'une école (Paramètres > Domaine), relié au backend App Hosting. */

const RESERVED_SUFFIXES = [".hosted.app", ".firebaseapp.com", ".web.app", ".run.app", ".local"];

export const schoolDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
  .pipe(
    z
      .string()
      .max(253)
      .regex(
        /^(?=.*[a-z])[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
        "Domaine invalide (ex. formation.ecolemotion.com)",
      )
      .refine(
        (host) => !RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix)),
        "Ce domaine ne peut pas être utilisé",
      ),
  );

export const schoolDomainInput = z.object({ host: schoolDomainSchema });
export type SchoolDomainInput = z.infer<typeof schoolDomainInput>;

export type DomainRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "CAA";

export interface DomainDnsRecord {
  type: DomainRecordType | string;
  name: string;
  value: string;
  action: "add" | "remove";
}

export type SchoolDomainStatus = "pending" | "active";

/** creators/{id}.customDomain : lisible publiquement (les enregistrements DNS ne sont pas secrets). */
export interface SchoolDomain<T = unknown> {
  host: string;
  status: SchoolDomainStatus;
  records: DomainDnsRecord[];
  checkedAt: T;
}

/** Réponse de l'API App Hosting (champs utiles). */
export interface AppHostingDomain {
  customDomainStatus?: {
    hostState?: string;
    certState?: string;
    ownershipState?: string;
    requiredDnsUpdates?: {
      desired?: { records?: ApiDnsRecord[] }[];
      discovered?: { records?: ApiDnsRecord[] }[];
    }[];
  };
}

interface ApiDnsRecord {
  type?: string;
  domainName?: string;
  rdata?: string;
  requiredAction?: string;
}

/** Enregistrements DNS à ajouter ou supprimer chez l'hébergeur du domaine. */
export function dnsRecordsToFix(domain: AppHostingDomain | null | undefined): DomainDnsRecord[] {
  const seen = new Set<string>();
  const records: DomainDnsRecord[] = [];
  for (const update of domain?.customDomainStatus?.requiredDnsUpdates ?? []) {
    for (const set of [...(update.desired ?? []), ...(update.discovered ?? [])]) {
      for (const record of set.records ?? []) {
        if (record.requiredAction !== "ADD" && record.requiredAction !== "REMOVE") continue;
        const entry: DomainDnsRecord = {
          type: record.type ?? "?",
          name: (record.domainName ?? "").replace(/\.$/, ""),
          value: record.rdata ?? "",
          action: record.requiredAction === "ADD" ? "add" : "remove",
        };
        const key = `${entry.action}|${entry.type}|${entry.name}|${entry.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push(entry);
        }
      }
    }
  }
  return records;
}

/** Domaine servi en HTTPS : hébergé et certificat actif. */
export function isDomainActive(domain: AppHostingDomain | null | undefined): boolean {
  const status = domain?.customDomainStatus;
  return status?.hostState === "HOST_ACTIVE" && status.certState === "CERT_ACTIVE";
}
