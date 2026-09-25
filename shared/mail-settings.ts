import { z } from "zod";
import { emailSchema } from "./schemas";

/**
 * Envoi des emails (bienvenue, invitations, notifications) via le serveur SMTP du formateur.
 * Le formateur renseigne ses accès dans Admin > Paramètres ; le mot de passe est chiffré côté serveur.
 */

export type MailProvider = "brevo" | "gmail" | "smtp";

export interface MailProviderPreset {
  label: string;
  /** Serveur imposé (null : saisi par le formateur). */
  host: string | null;
  port: number | null;
  usernameLabel: string;
  passwordLabel: string;
  help: string;
  helpUrl: string | null;
  helpLinkLabel: string | null;
}

export const MAIL_PROVIDERS: Record<MailProvider, MailProviderPreset> = {
  brevo: {
    label: "Brevo",
    host: "smtp-relay.brevo.com",
    port: 587,
    usernameLabel: "Identifiant SMTP",
    passwordLabel: "Clé SMTP",
    help: "Dans Brevo, ouvre SMTP & API > SMTP : l'identifiant est le « Login », la clé se génère sur la même page. L'adresse d'expédition doit être un expéditeur validé dans Brevo.",
    helpUrl: "https://app.brevo.com/settings/keys/smtp",
    helpLinkLabel: "Ouvrir Brevo",
  },
  gmail: {
    label: "Gmail",
    host: "smtp.gmail.com",
    port: 465,
    usernameLabel: "Adresse Gmail",
    passwordLabel: "Mot de passe d'application",
    help: "Crée un mot de passe d'application Google (la validation en deux étapes doit être activée). Limite : environ 500 emails par jour.",
    helpUrl: "https://myaccount.google.com/apppasswords",
    helpLinkLabel: "Créer un mot de passe d'application",
  },
  smtp: {
    label: "Autre (SMTP)",
    host: null,
    port: null,
    usernameLabel: "Identifiant",
    passwordLabel: "Mot de passe",
    help: "Les informations SMTP sont fournies par ton hébergeur d'email (OVH, Infomaniak, o2switch…).",
    helpUrl: null,
    helpLinkLabel: null,
  },
};

/** Ports SMTP autorisés (465 : TLS direct ; les autres : STARTTLS obligatoire). */
export const SMTP_PORTS = [465, 587, 2525, 25] as const;

const BLOCKED_HOST_SUFFIXES = ["localhost", ".local", ".internal", ".localdomain"];

/** Nom de domaine uniquement : pas d'adresse IP ni de nom interne. */
export const smtpHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.*[a-z])[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    "Adresse du serveur invalide (ex. smtp.monhebergeur.fr)",
  )
  .refine(
    (host) => !BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix)),
    "Adresse du serveur non autorisée",
  );

const singleLine = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);

export const mailSettingsInput = z
  .object({
    provider: z.enum(["brevo", "gmail", "smtp"]),
    // nullish : le SDK Firebase transmet les champs `undefined` sous la forme `null`.
    host: z.string().nullish(),
    port: z.number().int().nullish(),
    username: z
      .string()
      .trim()
      .min(1, "Identifiant requis")
      .max(200)
      .refine(singleLine, "Identifiant invalide"),
    /** Vide ou absent : le mot de passe déjà enregistré est conservé. */
    password: z.string().max(500).refine(singleLine, "Mot de passe invalide").nullish(),
    fromName: z
      .string()
      .trim()
      .min(1, "Nom d'expéditeur requis")
      .max(80)
      .refine(singleLine, "Nom d'expéditeur invalide"),
    fromEmail: emailSchema,
  })
  .superRefine((value, ctx) => {
    if (value.provider !== "smtp") return;
    const host = smtpHostSchema.safeParse(value.host ?? "");
    if (!host.success) {
      ctx.addIssue({
        code: "custom",
        path: ["host"],
        message: host.error.issues[0]?.message ?? "Adresse du serveur invalide",
      });
    }
    if (!SMTP_PORTS.includes(value.port as (typeof SMTP_PORTS)[number])) {
      ctx.addIssue({
        code: "custom",
        path: ["port"],
        message: `Port non autorisé (${SMTP_PORTS.join(", ")})`,
      });
    }
  });
export type MailSettingsInput = z.infer<typeof mailSettingsInput>;

export interface SmtpServer {
  host: string;
  port: number;
}

/** Serveur effectif : celui du fournisseur, ou celui saisi pour « Autre ». */
export function smtpServer(
  input: Pick<MailSettingsInput, "provider" | "host" | "port">,
): SmtpServer {
  const preset = MAIL_PROVIDERS[input.provider];
  if (preset.host && preset.port) return { host: preset.host, port: preset.port };
  return { host: smtpHostSchema.parse(input.host ?? ""), port: input.port ?? 587 };
}

/** Résultat de l'enregistrement : emails en attente renvoyés avec les nouveaux réglages. */
export interface SaveMailSettingsResult {
  sent: number;
  failed: number;
}
