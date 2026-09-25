import { Timestamp } from "firebase-admin/firestore";
import { DEFAULT_WELCOME_EMAIL } from "@shared/constants";
import { emailLayout, fillTemplate, textToHtml } from "@shared/template";
import type { CoursePrivateSettings, CreatorDoc, MailDelivery } from "@shared/types";

const MAIL_TTL_DAYS = 30;

/** File d'envoi : chaque document de `mail` est envoyé par onMailCreated (mail-delivery.ts). */
export interface MailDoc {
  /** Formateur dont les réglages d'envoi sont utilisés. */
  creatorId: string;
  to: string;
  replyTo?: string;
  message: { subject: string; html: string; text: string };
  expireAt: Timestamp;
  delivery?: MailDelivery<Timestamp>;
}

export interface Brand {
  name: string;
  color: string;
  supportEmail: string | null;
}

export function brandFromCreator(creator: CreatorDoc | undefined): Brand {
  return {
    name: creator?.name ?? "Forma Host",
    color: creator?.brandColor ?? "#06040e",
    supportEmail: creator?.supportEmail ?? null,
  };
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export interface WelcomeEmailInput {
  creatorId: string;
  to: string;
  studentName: string | null;
  courseTitle: string;
  settings: Pick<CoursePrivateSettings, "welcomeEmail"> | undefined;
  brand: Brand;
  ctaUrl: string;
  /** Nouveau compte : lien d'activation ; sinon lien direct vers la formation. */
  activation: boolean;
}

export function buildWelcomeEmail(input: WelcomeEmailInput): MailDoc {
  const template = input.settings?.welcomeEmail ?? DEFAULT_WELCOME_EMAIL;
  const vars = {
    prenom: firstName(input.studentName),
    formation: input.courseTitle,
    formateur: input.brand.name,
    lien: input.ctaUrl,
  };
  const subject = fillTemplate(template.subject, vars).replace(/\s+/g, " ").trim();
  const ctaLabel = input.activation ? "Activer mon compte" : "Accéder à la formation";
  const html = emailLayout({
    bodyHtml: textToHtml(template.body, vars),
    ctaLabel,
    ctaUrl: input.ctaUrl,
    brandName: input.brand.name,
    brandColor: input.brand.color,
    footer: input.activation
      ? "Ce lien d'activation est valable 30 jours."
      : `Email envoyé par ${input.brand.name}.`,
  });
  const text = `${fillTemplate(template.body, vars)}\n\n${ctaLabel} : ${input.ctaUrl}`;
  return mailDoc({
    creatorId: input.creatorId,
    to: input.to,
    subject,
    html,
    text,
    replyTo: input.brand.supportEmail,
  });
}

export function mailDoc(input: {
  creatorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
}): MailDoc {
  return {
    creatorId: input.creatorId,
    to: input.to,
    ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    message: { subject: input.subject, html: input.html, text: input.text },
    expireAt: Timestamp.fromMillis(Date.now() + MAIL_TTL_DAYS * 24 * 3600 * 1000),
  };
}
