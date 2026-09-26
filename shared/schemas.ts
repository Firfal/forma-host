import { z } from "zod";
import { GRANT_ACCESS_BATCH_MAX, OUTLINE_MAX_ITEMS } from "./constants";

/** Entrées des Cloud Functions appelables. Validées côté serveur, réutilisées côté client. */

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Email invalide"));

export const grantAccessInput = z.object({
  courseId: z.string().min(1),
  source: z.enum(["invite", "import"]),
  sendEmail: z.boolean(),
  students: z
    .array(
      z.object({
        email: emailSchema,
        name: z.string().trim().max(120).optional(),
        /** Date d'inscription d'origine (import Podia), ISO 8601. */
        joinedAt: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(GRANT_ACCESS_BATCH_MAX),
});
export type GrantAccessInput = z.infer<typeof grantAccessInput>;

export interface GrantAccessResult {
  created: number;
  reactivated: number;
  alreadyEnrolled: number;
  errors: { email: string; message: string }[];
}

export const inviteTokenInput = z.object({ token: z.string().min(20).max(100) });
export type InviteTokenInput = z.infer<typeof inviteTokenInput>;

export interface InviteInfo {
  email: string;
  /** Null pour une invitation à co-gérer une école. */
  courseTitle: string | null;
  creatorName: string;
}

export const acceptInviteInput = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(8, "8 caractères minimum").max(128),
  displayName: z.string().trim().min(1).max(80),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

export const courseStudentInput = z.object({
  courseId: z.string().min(1),
  uid: z.string().min(1),
});
export type CourseStudentInput = z.infer<typeof courseStudentInput>;

export const resolveVimeoInput = z.object({
  url: z.string().trim().min(1).max(2000),
  /** École dont le token Vimeo est utilisé (par défaut, celle de l'appelant). */
  schoolId: z.string().min(1).max(128).nullish(),
});
export type ResolveVimeoInput = z.infer<typeof resolveVimeoInput>;

export const courseIdInput = z.object({ courseId: z.string().min(1) });
export type CourseIdInput = z.infer<typeof courseIdInput>;

/** Validation des formulaires côté client. */

export const outlineItemSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(["chapter", "subchapter", "lesson"]),
  title: z.string().trim().min(1, "Titre requis").max(200),
  isPreview: z.boolean().optional(),
  hidden: z.boolean().optional(),
  durationSec: z.number().nonnegative().nullable().optional(),
});

export const outlineSchema = z.array(outlineItemSchema).max(OUTLINE_MAX_ITEMS);

export const lessonLinkSchema = z.object({
  label: z.string().trim().min(1, "Libellé requis").max(120),
  url: z.url({ protocol: /^https?$/, message: "URL invalide (http ou https)" }),
});
