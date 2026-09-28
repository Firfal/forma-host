import { describe, expect, it } from "vitest";
import {
  discountedAmount,
  formatPrice,
  installmentLabel,
  installmentPlan,
  isLiveKey,
  parsePriceInput,
  promoLabel,
  promoRedemptions,
  sameStripeMode,
} from "./payments";
import { coursePriceSchema, promoCodeInput } from "./payments-input";

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

describe("mode Stripe", () => {
  it("reconnaît les clés réelles et de test", () => {
    expect(isLiveKey("sk_live_abc")).toBe(true);
    expect(isLiveKey("rk_live_abc")).toBe(true);
    expect(isLiveKey("sk_test_abc")).toBe(false);
    expect(isLiveKey("unset")).toBe(false);
  });

  it("un compte sans mode enregistré vient du mode test", () => {
    expect(sameStripeMode(undefined, false)).toBe(true);
    expect(sameStripeMode(undefined, true)).toBe(false);
    expect(sameStripeMode(true, true)).toBe(true);
  });
});

describe("paiement en plusieurs fois", () => {
  it("mensualités égales, reliquat au premier paiement, total exact", () => {
    expect(installmentPlan(19700, 3)).toEqual({ count: 3, first: 6568, monthly: 6566 });
    expect(installmentPlan(19800, 3)).toEqual({ count: 3, first: 6600, monthly: 6600 });
    for (const [total, count] of [
      [19700, 3],
      [9999, 4],
      [5000, 2],
    ]) {
      const plan = installmentPlan(total, count);
      expect(plan.first + plan.monthly * (count - 1)).toBe(total);
      expect(plan.first).toBeGreaterThanOrEqual(plan.monthly);
    }
  });

  it("libellé de l'échéancier", () => {
    expect(installmentLabel(19800, 3).replace(/\s/g, " ")).toBe(
      "66 € aujourd'hui, puis 2 × 66 € par mois",
    );
  });

  it("options valides : 2, 3 ou 4 fois", () => {
    expect(
      coursePriceSchema.safeParse({ amount: 19700, currency: "eur", installments: [3] }).success,
    ).toBe(true);
    expect(
      coursePriceSchema.safeParse({ amount: 19700, currency: "eur", installments: [6] }).success,
    ).toBe(false);
  });
});

describe("remises des codes promo", () => {
  it("pourcentage arrondi au centime, montant fixe jamais négatif", () => {
    expect(discountedAmount(19700, { kind: "percent", value: 20 })).toBe(15760);
    expect(discountedAmount(9999, { kind: "percent", value: 15 })).toBe(8499);
    expect(discountedAmount(19700, { kind: "amount", value: 5000 })).toBe(14700);
    expect(discountedAmount(1000, { kind: "amount", value: 5000 })).toBe(0);
  });

  it("échéancier recalculé sur le prix remisé", () => {
    const total = discountedAmount(19700, { kind: "percent", value: 20 });
    expect(installmentPlan(total, 3)).toEqual({ count: 3, first: 5254, monthly: 5253 });
  });

  it("utilisations en une fois (Stripe) et en plusieurs fois (plateforme)", () => {
    expect(promoRedemptions({ timesRedeemed: 2, installmentRedemptions: 3 })).toBe(5);
    expect(promoRedemptions({ timesRedeemed: 2 })).toBe(2);
  });
});
