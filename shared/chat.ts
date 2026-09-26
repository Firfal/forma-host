import { z } from "zod";
import type { TimestampLike } from "./types";

/**
 * Chat entre une école (son équipe) et un élève : une conversation par couple école × élève,
 * conversations/{schoolId}_{studentUid}, messages dans la sous-collection `messages`.
 */

export const MESSAGE_MAX = 5000;
const EXCERPT_MAX = 140;

export const conversationId = (schoolId: string, studentUid: string) => `${schoolId}_${studentUid}`;

const uid = z.string().min(1).max(128);

/** Élève : `studentUid` omis. Équipe : l'élève à qui écrire. */
export const openConversationInput = z.object({
  schoolId: uid,
  studentUid: uid.nullish(),
});
export type OpenConversationInput = z.infer<typeof openConversationInput>;

/** Réglages d'une conversation : archivage et blocage (équipe), sourdine (chaque participant). */
export const updateConversationInput = z.object({
  conversationId: z.string().min(3).max(300),
  archived: z.boolean().nullish(),
  blocked: z.boolean().nullish(),
  muted: z.boolean().nullish(),
});
export type UpdateConversationInput = z.infer<typeof updateConversationInput>;

export interface ConversationDoc<T = TimestampLike> {
  schoolId: string;
  schoolName: string;
  studentUid: string;
  studentName: string;
  studentEmail: string | null;
  /** Première inscription de l'élève dans l'école (badge d'ancienneté). */
  studentSince: T | null;
  lastMessage: { body: string; authorUid: string } | null;
  lastMessageId: string | null;
  lastAt: T;
  unreadForSchool: number;
  unreadForStudent: number;
  /** Rangée par l'équipe ; revient dans la liste au prochain message de l'élève. */
  archived: boolean;
  /** L'élève ne peut plus écrire. */
  blocked: boolean;
  /** Participants qui ne reçoivent plus de notification pour cette conversation. */
  mutedBy: string[];
  createdAt: T;
}

export interface MessageDoc<T = TimestampLike> {
  authorUid: string;
  authorName: string;
  body: string;
  createdAt: T;
}

/** Aperçu d'un message sur une ligne (liste des conversations, notifications). */
export function messageExcerpt(body: string, max = EXCERPT_MAX): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
