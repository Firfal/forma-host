import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des secrets saisis par les formateurs (mot de passe SMTP), AES-256-GCM.
 * La clé vit dans Secret Manager (SETTINGS_ENCRYPTION_KEY) ; `context` lie le chiffré à son
 * propriétaire : un chiffré copié vers un autre formateur ne se déchiffre pas.
 */

const VERSION = "v1";

export function parseKey(raw: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error("Clé de chiffrement invalide (32 octets en base64)");
  return key;
}

export function encryptSecret(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const parts = [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64"));
  return [VERSION, ...parts].join(":");
}

export function decryptSecret(payload: string, key: Buffer, context: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Secret chiffré illisible");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
