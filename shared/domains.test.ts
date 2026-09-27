import { describe, expect, it } from "vitest";
import {
  detectDnsProvider,
  dnsRecordsFrom,
  domainPhase,
  isDomainActive,
  normalizeDnsValue,
  registrableDomain,
  relativeRecordName,
  schoolDomainInput,
  summarizeDomain,
  type AppHostingOperation,
  type DomainDnsRecord,
} from "./domains";

describe("schoolDomainInput", () => {
  it("normalise l'adresse saisie", () => {
    expect(schoolDomainInput.parse({ host: " https://Formation.EcoleMotion.com/ " }).host).toBe(
      "formation.ecolemotion.com",
    );
    expect(schoolDomainInput.parse({ host: "formation.ecolemotion.com?x=1" }).host).toBe(
      "formation.ecolemotion.com",
    );
  });

  it("refuse les adresses invalides ou réservées", () => {
    for (const host of [
      "localhost",
      "ecolemotion",
      "forma-host--forma-host.europe-west4.hosted.app",
      "x.web.app",
      "1.2.3.4",
    ]) {
      expect(schoolDomainInput.safeParse({ host }).success, host).toBe(false);
    }
  });
});

describe("noms DNS", () => {
  it("domaine acheté et nom court à saisir chez l'hébergeur", () => {
    expect(registrableDomain("formation.ecolemotion.com")).toBe("ecolemotion.com");
    expect(registrableDomain("ecolemotion.com")).toBe("ecolemotion.com");
    expect(registrableDomain("cours.ecole.co.uk")).toBe("ecole.co.uk");
    expect(relativeRecordName("formation.ecolemotion.com", "ecolemotion.com")).toBe("formation");
    expect(
      relativeRecordName("_acme-challenge_x.formation.ecolemotion.com", "ecolemotion.com"),
    ).toBe("_acme-challenge_x.formation");
    expect(relativeRecordName("ecolemotion.com", "ecolemotion.com")).toBe("@");
  });

  it("hébergeur reconnu à ses serveurs de noms", () => {
    expect(detectDnsProvider(["ns1102.ui-dns.biz.", "ns1119.ui-dns.de"])).toBe("ionos");
    expect(detectDnsProvider(["dns200.anycast.me", "ns200.anycast.me"])).toBe("ovh");
    expect(detectDnsProvider(["lara.ns.cloudflare.com"])).toBe("cloudflare");
    expect(detectDnsProvider(["ns1.example.net"])).toBeNull();
  });

  it("valeurs comparées telles que publiées", () => {
    expect(normalizeDnsValue("CNAME", "X.Authorize.Certificatemanager.goog.")).toBe(
      "x.authorize.certificatemanager.goog",
    );
    expect(normalizeDnsValue("TXT", '"fah-claim=AbC"')).toBe("fah-claim=AbC");
  });
});

const host = "formation.ecolemotion.com";
const quickSetup = [
  {
    desired: [
      {
        records: [
          {
            type: "TXT",
            domainName: `${host}.`,
            rdata: "fah-claim=abc",
            requiredAction: "ADD",
            relevantState: ["OWNERSHIP_STATE"],
          },
          {
            type: "A",
            domainName: `${host}.`,
            rdata: "35.219.200.1",
            requiredAction: "ADD",
            relevantState: ["HOST_STATE"],
          },
          { type: "A", domainName: host, rdata: "35.219.200.1", requiredAction: "ADD" },
          {
            type: "CNAME",
            domainName: `_acme-challenge_x.${host}.`,
            rdata: "x.authorize.certificatemanager.goog.",
            requiredAction: "NONE",
          },
        ],
      },
    ],
    discovered: [
      {
        records: [
          { type: "AAAA", domainName: host, rdata: "::1", requiredAction: "REMOVE" },
          {
            type: "CNAME",
            domainName: `_acme-challenge_x.${host}`,
            rdata: "x.authorize.certificatemanager.goog.",
            requiredAction: "NONE",
          },
        ],
      },
    ],
  },
];

describe("enregistrements DNS App Hosting", () => {
  it("à créer, déjà en place ou à supprimer, sans doublon et dans l'ordre du guide", () => {
    expect(dnsRecordsFrom(quickSetup)).toEqual([
      { type: "A", name: host, value: "35.219.200.1", action: "add", purpose: "host" },
      { type: "TXT", name: host, value: "fah-claim=abc", action: "add", purpose: "ownership" },
      {
        type: "CNAME",
        name: `_acme-challenge_x.${host}`,
        value: "x.authorize.certificatemanager.goog.",
        action: "ok",
        purpose: "cert",
      },
      { type: "AAAA", name: host, value: "::1", action: "remove", purpose: "host" },
    ]);
  });

  it("juste après la création : enregistrements lus dans l'opération", () => {
    const operation: AppHostingOperation = {
      name: "projects/p/locations/l/operations/op1",
      done: false,
      metadata: {
        customDomainOperationMetadata: {
          hostState: "HOST_UNHOSTED",
          ownershipState: "OWNERSHIP_MISSING",
          certState: "CERT_PREPARING",
          quickSetupUpdates: quickSetup,
          issues: [{ code: 5, message: "No A records found" }],
        },
      },
    };
    // Domaine sans vérification DNS encore faite : rien dans requiredDnsUpdates.
    const summary = summarizeDomain({ customDomainStatus: {} }, operation);
    expect(summary).toMatchObject({
      status: "pending",
      hostState: "HOST_UNHOSTED",
      ownershipState: "OWNERSHIP_MISSING",
      issues: ["No A records found"],
    });
    expect(summary.records.map((record) => record.type)).toEqual(["A", "TXT", "CNAME", "AAAA"]);
    expect(domainPhase(summary)).toBe("dns");
  });

  it("les enregistrements vérifiés du domaine priment sur ceux de l'opération", () => {
    const summary = summarizeDomain(
      {
        customDomainStatus: {
          hostState: "HOST_ACTIVE",
          ownershipState: "OWNERSHIP_PENDING",
          certState: "CERT_VALIDATING",
          requiredDnsUpdates: [
            {
              desired: [
                {
                  records: [
                    { type: "A", domainName: host, rdata: "1.2.3.4", requiredAction: "NONE" },
                  ],
                },
              ],
            },
          ],
        },
      },
      { metadata: { customDomainOperationMetadata: { quickSetupUpdates: quickSetup } } },
    );
    expect(summary.records).toEqual([
      { type: "A", name: host, value: "1.2.3.4", action: "ok", purpose: "host" },
    ]);
    expect(domainPhase(summary)).toBe("verifying");
  });

  it("actif seulement quand hébergé, possédé et avec un certificat valide", () => {
    expect(isDomainActive({ customDomainStatus: { hostState: "HOST_ACTIVE" } })).toBe(false);
    expect(
      isDomainActive({
        customDomainStatus: {
          hostState: "HOST_ACTIVE",
          ownershipState: "OWNERSHIP_PENDING",
          certState: "CERT_ACTIVE",
        },
      }),
    ).toBe(false);
    const active = summarizeDomain(
      {
        customDomainStatus: {
          hostState: "HOST_ACTIVE",
          ownershipState: "OWNERSHIP_ACTIVE",
          certState: "CERT_ACTIVE",
          requiredDnsUpdates: quickSetup,
        },
      },
      null,
    );
    expect(active).toMatchObject({ status: "active", records: [] });
    expect(domainPhase(active)).toBe("active");
  });
});

describe("étape du parcours", () => {
  const record = (patch: Partial<DomainDnsRecord>): DomainDnsRecord => ({
    type: "A",
    name: host,
    value: "35.219.200.1",
    action: "add",
    ...patch,
  });
  const pending = { status: "pending" as const, hostState: "HOST_UNHOSTED" };

  it("préparation, DNS à faire, puis vérification dès que tout est visible", () => {
    expect(domainPhase({ ...pending, records: [] })).toBe("preparing");
    expect(domainPhase({ ...pending, records: [record({ found: false })] })).toBe("dns");
    expect(domainPhase({ ...pending, records: [record({ found: null })] })).toBe("dns");
    expect(
      domainPhase({ ...pending, records: [record({ found: true }), record({ action: "ok" })] }),
    ).toBe("verifying");
    // Un enregistrement en conflit reste à supprimer tant qu'il est visible.
    expect(domainPhase({ ...pending, records: [record({ action: "remove", found: true })] })).toBe(
      "dns",
    );
  });

  it("certificat en cours une fois l'adresse et la propriété confirmées", () => {
    expect(
      domainPhase({
        status: "pending",
        hostState: "HOST_ACTIVE",
        ownershipState: "OWNERSHIP_ACTIVE",
        certState: "CERT_VALIDATING",
        records: [],
      }),
    ).toBe("certificate");
  });
});
