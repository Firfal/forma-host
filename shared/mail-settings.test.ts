import { describe, expect, it } from "vitest";
import { mailSettingsInput, smtpServer } from "./mail-settings";

const base = {
  username: "9a1b2c001@smtp-brevo.com",
  password: "xsmtpsib-123",
  fromName: "Ecole Motion",
  fromEmail: "Contact@EcoleMotion.com",
};

describe("mailSettingsInput", () => {
  it("accepte un fournisseur prédéfini sans serveur", () => {
    const parsed = mailSettingsInput.parse({ ...base, provider: "brevo" });
    expect(parsed.fromEmail).toBe("contact@ecolemotion.com");
    expect(smtpServer(parsed)).toEqual({ host: "smtp-relay.brevo.com", port: 587 });
  });

  it("impose le serveur du fournisseur, même si le client en envoie un autre", () => {
    const parsed = mailSettingsInput.parse({
      ...base,
      provider: "gmail",
      host: "evil.example.com",
      port: 25,
    });
    expect(smtpServer(parsed)).toEqual({ host: "smtp.gmail.com", port: 465 });
  });

  it("valide le serveur et le port pour « Autre »", () => {
    const ok = mailSettingsInput.parse({
      ...base,
      provider: "smtp",
      host: " SSL0.OVH.NET ",
      port: 465,
    });
    expect(smtpServer(ok)).toEqual({ host: "ssl0.ovh.net", port: 465 });

    for (const host of [
      "127.0.0.1",
      "localhost",
      "metadata.google.internal",
      "smtp",
      "a b.fr",
      "",
    ]) {
      expect(
        mailSettingsInput.safeParse({ ...base, provider: "smtp", host, port: 587 }).success,
        host,
      ).toBe(false);
    }
    expect(
      mailSettingsInput.safeParse({ ...base, provider: "smtp", host: "smtp.ovh.net", port: 80 })
        .success,
    ).toBe(false);
  });

  it("refuse les retours à la ligne (injection d'en-têtes)", () => {
    expect(
      mailSettingsInput.safeParse({ ...base, provider: "brevo", fromName: "Ecole\r\nBcc: x@y.fr" })
        .success,
    ).toBe(false);
  });

  it("accepte les champs vides transmis à null par le SDK Firebase", () => {
    const parsed = mailSettingsInput.parse({
      ...base,
      provider: "gmail",
      host: null,
      port: null,
      password: null,
    });
    expect(smtpServer(parsed)).toEqual({ host: "smtp.gmail.com", port: 465 });
    expect(
      mailSettingsInput.safeParse({ ...base, provider: "smtp", host: null, port: null }).success,
    ).toBe(false);
  });

  it("le mot de passe est optionnel (conservé côté serveur)", () => {
    const withoutPassword: Partial<typeof base> = { ...base };
    delete withoutPassword.password;
    expect(mailSettingsInput.safeParse({ ...withoutPassword, provider: "brevo" }).success).toBe(
      true,
    );
  });
});
