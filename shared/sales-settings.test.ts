import { describe, expect, it } from "vitest";
import { DEFAULT_SALES_SETTINGS, salesSettingsInput, salesSettingsOf } from "./sales-settings";

describe("réglages de vente", () => {
  it("valeurs par défaut : accès retiré à l'arrêt des relances, factures Forma Host", () => {
    expect(salesSettingsOf(null)).toEqual(DEFAULT_SALES_SETTINGS);
    expect(salesSettingsOf({ invoicing: "stripe" })).toEqual({
      unpaidPolicy: "end",
      invoicing: "stripe",
    });
  });

  it("saisie validée", () => {
    expect(
      salesSettingsInput.safeParse({ unpaidPolicy: "never", invoicing: "external" }).success,
    ).toBe(true);
    expect(
      salesSettingsInput.safeParse({ unpaidPolicy: "parfois", invoicing: "external" }).success,
    ).toBe(false);
  });
});
