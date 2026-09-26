import { describe, expect, it } from "vitest";
import { dnsRecordsToFix, isDomainActive, schoolDomainInput } from "./domains";

describe("schoolDomainInput", () => {
  it("normalise le domaine saisi", () => {
    expect(schoolDomainInput.parse({ host: " https://Formation.EcoleMotion.com/ " }).host).toBe(
      "formation.ecolemotion.com",
    );
  });

  it("refuse les domaines invalides ou réservés", () => {
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

describe("état du domaine App Hosting", () => {
  const pending = {
    customDomainStatus: {
      hostState: "HOST_UNHOSTED",
      certState: "CERT_PREPARING",
      requiredDnsUpdates: [
        {
          desired: [
            {
              records: [
                {
                  type: "A",
                  domainName: "formation.ecolemotion.com.",
                  rdata: "35.219.200.1",
                  requiredAction: "ADD",
                },
                {
                  type: "TXT",
                  domainName: "formation.ecolemotion.com",
                  rdata: "fah-claim=abc",
                  requiredAction: "ADD",
                },
                {
                  type: "A",
                  domainName: "formation.ecolemotion.com",
                  rdata: "35.219.200.1",
                  requiredAction: "ADD",
                },
                { type: "CNAME", domainName: "x", rdata: "y", requiredAction: "NONE" },
              ],
            },
          ],
          discovered: [
            {
              records: [
                {
                  type: "AAAA",
                  domainName: "formation.ecolemotion.com",
                  rdata: "::1",
                  requiredAction: "REMOVE",
                },
              ],
            },
          ],
        },
      ],
    },
  };

  it("liste les enregistrements DNS à corriger, sans doublon", () => {
    expect(dnsRecordsToFix(pending)).toEqual([
      { type: "A", name: "formation.ecolemotion.com", value: "35.219.200.1", action: "add" },
      { type: "TXT", name: "formation.ecolemotion.com", value: "fah-claim=abc", action: "add" },
      { type: "AAAA", name: "formation.ecolemotion.com", value: "::1", action: "remove" },
    ]);
  });

  it("actif seulement quand hébergé avec un certificat valide", () => {
    expect(isDomainActive(pending)).toBe(false);
    expect(
      isDomainActive({
        customDomainStatus: { hostState: "HOST_ACTIVE", certState: "CERT_ACTIVE" },
      }),
    ).toBe(true);
  });
});
