import { z } from "zod";

/** Annonces d'une formation (onglet Annonces), publiées aux élèves inscrits. */

export const publishAnnouncementInput = z.object({
  courseId: z.string().min(1).max(128),
  title: z.string().trim().min(1, "Titre requis").max(120, "120 caractères maximum"),
  body: z.string().trim().min(1, "Message requis").max(5000, "5 000 caractères maximum"),
  /** Email aux élèves en plus de la notification (choix explicite du formateur). */
  sendEmail: z.boolean(),
});
export type PublishAnnouncementInput = z.infer<typeof publishAnnouncementInput>;

/** courses/{id}/announcements/{id} : lisible par les élèves inscrits et l'équipe. */
export interface AnnouncementDoc<T = unknown> {
  title: string;
  body: string;
  authorName: string;
  /** Élèves prévenus (notification) et emails envoyés. */
  recipients: number;
  emailed: boolean;
  createdAt: T;
}
