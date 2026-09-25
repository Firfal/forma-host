import { describe, expect, it } from "vitest";
import { isPrivateAddress, SmtpSetupError, smtpErrorMessage } from "./smtp";

describe("isPrivateAddress", () => {
  it("bloque le réseau interne", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
    ]) {
      expect(isPrivateAddress(address, 4), address).toBe(true);
    }
    for (const address of [
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPrivateAddress(address, 6), address).toBe(true);
    }
  });

  it("laisse passer les adresses publiques", () => {
    expect(isPrivateAddress("1.179.112.1", 4)).toBe(false);
    expect(isPrivateAddress("142.250.27.108", 4)).toBe(false);
    expect(isPrivateAddress("2a00:1450:400c:c0b::6c", 6)).toBe(false);
  });
});

describe("smtpErrorMessage", () => {
  it("traduit les erreurs courantes", () => {
    expect(smtpErrorMessage({ code: "EAUTH", response: "535 5.7.8 Authentication failed" })).toBe(
      "Identifiant ou mot de passe refusé par le serveur. (535 5.7.8 Authentication failed)",
    );
    expect(smtpErrorMessage({ code: "ETIMEDOUT", message: "Connection timeout" })).toContain(
      "vérifie l'adresse et le port",
    );
    expect(smtpErrorMessage(new SmtpSetupError("Mot de passe requis."))).toBe(
      "Mot de passe requis.",
    );
    expect(smtpErrorMessage({})).toBe("Envoi impossible.");
  });

  it("tronque les réponses longues", () => {
    const message = smtpErrorMessage({ code: "EENVELOPE", response: "x".repeat(1000) });
    expect(message.length).toBeLessThan(300);
  });
});
