import { describe, expect, it } from "vitest";
import {
  legalPage,
  legalWarnings,
  schoolLegalInput,
  vatMention,
  vatRate,
  type SchoolLegalInfo,
} from "./legal";

const input = {
  companyName: "Ecole Motion",
  legalForm: "Entreprise individuelle",
  siret: "123 456 789 00012",
  address: "1 rue de la Paix, 75002 Paris",
  vatMode: "franchise" as const,
  vatNumber: "",
  publisherName: "Théo Robert",
  contactEmail: "Contact@EcoleMotion.com",
  phone: "",
  mediatorName: "CM2C",
  mediatorUrl: "https://www.cm2c.net",
  refundDays: 14,
  accessMonths: null,
  extraTerms: "",
};
const ctx = { schoolName: "Ecole Motion", platformName: "Forma Host" };
const text = (page: ReturnType<typeof legalPage>) =>
  page.sections.flatMap((section) => [section.heading, ...section.paragraphs]).join("\n");

describe("informations légales", () => {
  it("normalise la saisie", () => {
    const info = schoolLegalInput.parse(input);
    expect(info).toMatchObject({
      siret: "12345678900012",
      contactEmail: "contact@ecolemotion.com",
      vatNumber: null,
      phone: null,
      extraTerms: null,
    });
  });

  it("refuse un SIRET invalide et exige le numéro de TVA à 20 %", () => {
    expect(schoolLegalInput.safeParse({ ...input, siret: "1234" }).success).toBe(false);
    const vat = schoolLegalInput.safeParse({ ...input, vatMode: "standard" });
    expect(vat.success).toBe(false);
    expect(vat.error?.issues[0]?.path).toEqual(["vatNumber"]);
    expect(
      schoolLegalInput.safeParse({ ...input, vatMode: "standard", vatNumber: "FR12345678901" })
        .success,
    ).toBe(true);
  });

  it("TVA : taux et mention selon le régime", () => {
    expect(vatRate({ vatMode: "standard" })).toBe(20);
    expect(vatRate({ vatMode: "franchise" })).toBe(0);
    expect(vatMention({ vatMode: "franchise", vatNumber: null })).toContain("293 B");
    expect(vatMention({ vatMode: "exempt", vatNumber: null })).toContain("261-4-4°");
    expect(vatMention({ vatMode: "standard", vatNumber: "FR1" })).toContain("FR1");
  });
});

describe("pages légales générées", () => {
  const info = schoolLegalInput.parse(input) as SchoolLegalInfo;

  it("mentions légales : éditeur, directeur de la publication, hébergeur", () => {
    const page = text(legalPage("mentions-legales", info, ctx));
    expect(page).toContain("SIRET : 12345678900012");
    expect(page).toContain("Théo Robert");
    expect(page).toContain("Google Cloud EMEA Limited");
    expect(page).toContain("Plateforme technique : Forma Host");
  });

  it("CGV : renonciation à la rétractation, garantie, médiateur, clauses ajoutées", () => {
    const page = text(legalPage("cgv", info, ctx));
    expect(page).toContain("L221-28 13°");
    expect(page).toContain("dans les 14 jours suivant l'achat");
    expect(page).toContain("médiateur de la consommation : CM2C (https://www.cm2c.net)");
    expect(page).toContain("sans limite de durée");
    expect(page).not.toContain("Dispositions particulières");

    const custom = text(
      legalPage("cgv", { ...info, refundDays: 0, accessMonths: 12, extraTerms: "A\n\nB" }, ctx),
    );
    expect(custom).not.toContain("Garantie");
    expect(custom).toContain("valable 12 mois");
    expect(custom).toContain("Dispositions particulières");
  });

  it("confidentialité : responsable, sous-traitants, droits", () => {
    const page = text(legalPage("confidentialite", info, ctx));
    expect(page).toContain("Ecole Motion, 1 rue de la Paix");
    expect(page).toContain("Stripe");
    expect(page).toContain("CNIL");
  });

  it("alerte sur le médiateur manquant", () => {
    expect(legalWarnings(null)).toHaveLength(1);
    expect(legalWarnings(info)).toEqual([]);
    expect(legalWarnings({ ...info, mediatorName: null })[0]).toContain("Médiateur");
  });
});
