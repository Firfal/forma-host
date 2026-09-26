import { describe, expect, it } from "vitest";
import { formatPrice, parsePriceInput, promoCodeInput, promoLabel } from "./payments";

describe("prix", () => {
  it("formate en euros", () => {
    expect(formatPrice(19700).replace(/\s/g, " ")).toBe("197 €");
    expect(formatPrice(19750).replace(/\s/g, " ")).toBe("197,50 €");
  });

  it("lit la saisie du formateur", () => {
    expect(parsePriceInput("197")).toBe(19700);
    expect(parsePriceInput("197,5 €")).toBe(19750);
    expect(parsePriceInput("1 297.99")).toBe(129799);
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-3")).toBeNull();
  });
});

describe("codes promo", () => {
  const base = { courseId: "c1", code: " bienvenue-20 ", kind: "percent" as const, value: 20 };

  it("normalise le code", () => {
    expect(promoCodeInput.parse(base).code).toBe("BIENVENUE-20");
    expect(promoLabel({ kind: "percent", value: 20 })).toBe("-20 %");
  });

  it("refuse les valeurs incohérentes", () => {
    expect(promoCodeInput.safeParse({ ...base, value: 120 }).success).toBe(false);
    expect(promoCodeInput.safeParse({ ...base, code: "a b" }).success).toBe(false);
    expect(promoCodeInput.safeParse({ ...base, expiresAt: "2020-01-01T00:00:00Z" }).success).toBe(
      false,
    );
  });
});
