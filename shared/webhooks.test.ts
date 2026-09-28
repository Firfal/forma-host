import { describe, expect, it } from "vitest";
import { webhookInput, webhookUrlError } from "./webhooks";

describe("webhooks", () => {
  it("adresse publique en https uniquement", () => {
    expect(webhookUrlError("https://hooks.zapier.com/hooks/catch/1/abc")).toBeNull();
    expect(webhookUrlError("http://hooks.zapier.com/x")).toMatch(/https/);
    expect(webhookUrlError("https://169.254.169.254/latest")).toMatch(/publique/);
    expect(webhookUrlError("https://localhost/x")).toMatch(/publique/);
    expect(webhookUrlError("https://metadata.google.internal/x")).toMatch(/publique/);
    expect(webhookUrlError("https://[::1]/x")).toMatch(/publique/);
    expect(webhookUrlError("https://user:pass@hook.eu1.make.com/x")).toMatch(/identifiants/);
    expect(webhookUrlError("pas une adresse")).toBe("Adresse invalide");
  });

  it("au moins un événement connu, sans doublon", () => {
    const base = { schoolId: "theo", url: "https://hook.eu1.make.com/abc" };
    expect(webhookInput.parse({ ...base, events: ["order.paid", "order.paid"] }).events).toEqual([
      "order.paid",
    ]);
    expect(webhookInput.safeParse({ ...base, events: [] }).success).toBe(false);
    expect(webhookInput.safeParse({ ...base, events: ["inconnu"] }).success).toBe(false);
  });
});
