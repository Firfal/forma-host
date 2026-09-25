import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { createTransport as createNodemailerTransport } from "nodemailer";

/** Connexion au serveur SMTP du formateur (nodemailer). Remplaçable en test. */

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface OutgoingMail {
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
}

export interface SmtpClient {
  /** Vérifie la connexion et l'authentification, sans envoyer d'email. */
  verify(config: SmtpConfig): Promise<void>;
  send(config: SmtpConfig, mail: OutgoingMail): Promise<{ messageId: string | null }>;
}

/** Erreur au message déjà lisible par le formateur. */
export class SmtpSetupError extends Error {}

// Le serveur est saisi par le formateur : pas de connexion vers le réseau interne.
const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv6");
}

export function isPrivateAddress(address: string, family: 4 | 6): boolean {
  return privateRanges.check(address, family === 4 ? "ipv4" : "ipv6");
}

async function assertPublicHost(host: string): Promise<void> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SmtpSetupError(`Serveur « ${host} » introuvable : vérifie son adresse.`);
  }
  if (addresses.some(({ address, family }) => isPrivateAddress(address, family === 6 ? 6 : 4))) {
    throw new SmtpSetupError("Adresse de serveur non autorisée.");
  }
}

function createTransport(config: SmtpConfig) {
  const secure = config.port === 465;
  return createNodemailerTransport({
    host: config.host,
    port: config.port,
    secure,
    // Sans TLS direct, STARTTLS est exigé : les identifiants ne circulent jamais en clair.
    requireTLS: !secure,
    auth: { user: config.username, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export const smtpClient: SmtpClient = {
  async verify(config) {
    await assertPublicHost(config.host);
    const transport = createTransport(config);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
  },
  async send(config, mail) {
    await assertPublicHost(config.host);
    const transport = createTransport(config);
    try {
      const info = await transport.sendMail({
        from: { name: config.fromName, address: config.fromEmail },
        to: mail.to,
        ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      return { messageId: info.messageId ?? null };
    } finally {
      transport.close();
    }
  },
};

/** Message lisible pour une erreur SMTP (sans jamais inclure le mot de passe). */
export function smtpErrorMessage(error: unknown): string {
  if (error instanceof SmtpSetupError) return error.message;
  const { code, response, message } = error as {
    code?: string;
    response?: string;
    message?: string;
  };
  const detail = (response || message || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const withDetail = (text: string) => (detail ? `${text} (${detail})` : text);
  switch (code) {
    case "EAUTH":
    case "ENOAUTH":
      return withDetail("Identifiant ou mot de passe refusé par le serveur.");
    case "EDNS":
      return withDetail("Serveur introuvable : vérifie son adresse.");
    case "ETIMEDOUT":
    case "ECONNECTION":
    case "ESOCKET":
      return withDetail("Connexion au serveur impossible : vérifie l'adresse et le port.");
    case "ETLS":
      return withDetail("Connexion sécurisée (TLS) impossible avec ce serveur.");
    case "EENVELOPE":
      return withDetail("Adresse refusée par le serveur.");
    default:
      return detail || "Envoi impossible.";
  }
}
