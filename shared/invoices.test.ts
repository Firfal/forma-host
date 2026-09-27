import { describe, expect, it } from "vitest";
import {
  buildInvoice,
  formatInvoiceNumber,
  formatPostalAddress,
  invoiceAmounts,
  invoiceSeries,
} from "./invoices";
import type { SchoolLegalInfo } from "./legal";

const legal: SchoolLegalInfo = {
  companyName: "Ecole Motion",
  legalForm: "SAS",
  siret: "12345678900012",
  address: "1 rue de la Paix, 75002 Paris",
  vatMode: "standard",
  vatNumber: "FR12345678901",
  publisherName: "Théo Robert",
  contactEmail: "contact@ecolemotion.com",
  phone: null,
  mediatorName: "CM2C",
  mediatorUrl: null,
  refundDays: 0,
  accessMonths: null,
  extraTerms: null,
};

describe("factures", () => {
  it("numérotation par série, année et séquence", () => {
    expect(formatInvoiceNumber("invoices", 2026, 7)).toBe("F-2026-0007");
    expect(formatInvoiceNumber("creditNotes", 2026, 1)).toBe("A-2026-0001");
    expect(formatInvoiceNumber("testInvoices", 2026, 12)).toBe("TEST-F-2026-0012");
    expect(invoiceSeries("invoice", true)).toBe("invoices");
    expect(invoiceSeries("invoice", false)).toBe("testInvoices");
    expect(invoiceSeries("creditNote", false)).toBe("testCreditNotes");
  });

  it("TTC → HT + TVA, total conservé", () => {
    expect(invoiceAmounts(19700, 20)).toEqual({
      amountExclTax: 16417,
      vatAmount: 3283,
      amountInclTax: 19700,
    });
    expect(invoiceAmounts(19700, 0)).toEqual({
      amountExclTax: 19700,
      vatAmount: 0,
      amountInclTax: 19700,
    });
  });

  it("facture figée : vendeur, acheteur, montants et mention de TVA", () => {
    const invoice = buildInvoice({
      number: "F-2026-0001",
      issuedAt: "2026-09-27",
      legal,
      buyer: { name: "Léa", email: "lea@test.fr", address: null },
      description: "Formation en ligne : After Effects",
      amountInclTax: 12000,
    });
    expect(invoice).toMatchObject({
      number: "F-2026-0001",
      seller: { companyName: "Ecole Motion", vatNumber: "FR12345678901" },
      vatRate: 20,
      amountExclTax: 10000,
      vatAmount: 2000,
      creditNote: null,
    });
    expect(invoice.seller).not.toHaveProperty("publisherName");
    expect(
      buildInvoice({
        ...{ number: "x", issuedAt: 0, buyer: invoice.buyer, description: "d" },
        legal: { ...legal, vatMode: "franchise" },
        amountInclTax: 100,
      }).vatMention,
    ).toContain("293 B");
  });

  it("adresse Stripe sur une ligne", () => {
    expect(
      formatPostalAddress({ line1: "1 rue A", postal_code: "75002", city: "Paris", country: "FR" }),
    ).toBe("1 rue A, 75002 Paris");
    expect(formatPostalAddress({ line1: "Main St", city: "Bruxelles", country: "BE" })).toBe(
      "Main St, Bruxelles, BE",
    );
    expect(formatPostalAddress(null)).toBeNull();
    expect(formatPostalAddress({})).toBeNull();
  });
});
