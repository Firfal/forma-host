import { describe, expect, it } from "vitest";
import { brandContrastAdvice, brandPalette, contrastRatio, DEFAULT_BRAND_COLOR } from "./color";

describe("couleur de l'école", () => {
  it("reprise telle quelle, texte blanc", () => {
    expect(brandPalette("#9D72F9")).toEqual({ brand: "#9d72f9", ink: "#ffffff", text: "#9d72f9" });
    expect(brandPalette("#ffd400").brand).toBe("#ffd400");
  });

  it("valeur invalide : couleur par défaut", () => {
    expect(brandPalette("violet").brand).toBe(DEFAULT_BRAND_COLOR);
    expect(brandPalette(null).brand).toBe(DEFAULT_BRAND_COLOR);
  });

  it("conseil seulement si le texte blanc est peu lisible, avec une teinte proche", () => {
    expect(brandContrastAdvice("#5a0eb5")).toBeNull();
    const advice = brandContrastAdvice("#9d72f9");
    expect(advice?.ratio).toBeLessThan(4.5);
    expect(advice?.suggestion).toBe("#8561d4");
    expect(contrastRatio(advice!.suggestion!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(brandContrastAdvice("#nope")).toBeNull();
  });
});
