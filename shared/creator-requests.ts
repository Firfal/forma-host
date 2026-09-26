import { z } from "zod";
import { schoolSlugSchema } from "./school";

/**
 * Demande d'espace formateur (creatorRequests/{uid}) : créée par l'utilisateur depuis
 * /devenir-formateur, acceptée ou refusée par un administrateur de la plateforme.
 */

export type CreatorRequestStatus = "pending" | "approved" | "rejected";

export interface CreatorRequestDoc<T = unknown> {
  uid: string;
  email: string;
  displayName: string;
  schoolName: string;
  slug: string;
  message: string;
  status: CreatorRequestStatus;
  createdAt: T;
  decidedAt?: T | null;
  rejectionReason?: string | null;
}

export const creatorRequestForm = z.object({
  schoolName: z.string().trim().min(1, "Nom de l'école requis").max(80, "80 caractères maximum"),
  slug: schoolSlugSchema,
  message: z.string().trim().max(2000, "2000 caractères maximum"),
});
export type CreatorRequestForm = z.infer<typeof creatorRequestForm>;

export const approveCreatorRequestInput = z.object({
  uid: z.string().min(1).max(128),
  /** Adresse publique retenue (l'administrateur peut corriger celle demandée). */
  slug: schoolSlugSchema,
});
export type ApproveCreatorRequestInput = z.infer<typeof approveCreatorRequestInput>;

export const rejectCreatorRequestInput = z.object({
  uid: z.string().min(1).max(128),
  reason: z.string().trim().max(1000).nullish(),
});
export type RejectCreatorRequestInput = z.infer<typeof rejectCreatorRequestInput>;
