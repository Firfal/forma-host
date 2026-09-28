import { describe, expect, it } from "vitest";
import { brandPalette, contrastRatio, DEFAULT_BRAND_COLOR } from "./color";

describe("couleur d'école lisible", () => {
  it("couleur déjà sombre : inchangée, texte blanc", () => {
    expect(brandPalette("#5a0eb5")).toEqual({ brand: "#5a0eb5", ink: "#ffffff", text: "#5a0eb5" });
  });

  it("texte de couleur lisible aussi sur un fond teinté à 10 %", () => {
    const { text } = brandPalette("#9d72f9");
    expect(contrastRatio(text, "#f3effb")).toBeGreaterThanOrEqual(4.5);
  });

  it("violet clair : légèrement assombri jusqu'au contraste AA", () => {
    const palette = brandPalette("#9D72F9");
    expect(palette.ink).toBe("#ffffff");
    expect(palette.brand).not.toBe("#9d72f9");
    expect(contrastRatio(palette.brand, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("jaune : couleur gardée avec un texte sombre, texte de couleur assombri", () => {
    const palette = brandPalette("#ffd400");
    expect(palette.brand).toBe("#ffd400");
    expect(palette.ink).toBe("#111111");
    expect(contrastRatio(palette.brand, palette.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(palette.text, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("valeur invalide : couleur par défaut", () => {
    expect(brandPalette("violet").brand).toBe(DEFAULT_BRAND_COLOR);
    expect(brandPalette(null).brand).toBe(DEFAULT_BRAND_COLOR);
  });
});
