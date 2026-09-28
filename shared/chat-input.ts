import { z } from "zod";
import type { OpenConversationInput, UpdateConversationInput } from "./chat";

const uid = z.string().min(1).max(128);

/** Élève : `studentUid` omis. Équipe : l'élève à qui écrire. */
export const openConversationInput: z.ZodType<OpenConversationInput> = z.object({
  schoolId: uid,
  studentUid: uid.nullish(),
});

/** Réglages d'une conversation : archivage et blocage (équipe), sourdine (chaque participant). */
export const updateConversationInput: z.ZodType<UpdateConversationInput> = z.object({
  conversationId: z.string().min(3).max(300),
  archived: z.boolean().nullish(),
  blocked: z.boolean().nullish(),
  muted: z.boolean().nullish(),
});
