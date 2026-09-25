import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, parseKey } from "./crypto";

const key = randomBytes(32);

describe("chiffrement des secrets", () => {
  it("chiffre puis déchiffre", () => {
    const payload = encryptSecret("clé-smtp-très-secrète", key, "mail:theo");
    expect(payload).not.toContain("secrète");
    expect(payload.startsWith("v1:")).toBe(true);
    expect(decryptSecret(payload, key, "mail:theo")).toBe("clé-smtp-très-secrète");
  });

  it("deux chiffrements du même secret diffèrent (IV aléatoire)", () => {
    expect(encryptSecret("x", key, "c")).not.toBe(encryptSecret("x", key, "c"));
  });

  it("refuse un autre propriétaire, une autre clé ou un chiffré modifié", () => {
    const payload = encryptSecret("secret", key, "mail:theo");
    expect(() => decryptSecret(payload, key, "mail:anne")).toThrow();
    expect(() => decryptSecret(payload, randomBytes(32), "mail:theo")).toThrow();
    const [version, iv, tag, data] = payload.split(":");
    const tampered = Buffer.from(data, "base64");
    tampered[0] ^= 1;
    expect(() =>
      decryptSecret([version, iv, tag, tampered.toString("base64")].join(":"), key, "mail:theo"),
    ).toThrow();
    expect(() => decryptSecret("n'importe quoi", key, "mail:theo")).toThrow("illisible");
  });

  it("valide la clé (32 octets en base64)", () => {
    expect(parseKey(key.toString("base64"))).toEqual(key);
    expect(() => parseKey("")).toThrow("invalide");
    expect(() => parseKey(randomBytes(16).toString("base64"))).toThrow("invalide");
  });
});
