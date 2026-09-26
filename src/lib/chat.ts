"use client";

import {
  addDoc,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useMemo } from "react";
import type { ConversationDoc, MessageDoc } from "@shared/chat";
import { paths } from "@shared/paths";
import type { TimestampLike } from "@shared/types";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";

/** Côté de la conversation vu par la personne connectée. */
export type ChatSide = "school" | "student";

export type ConversationWithId = ConversationDoc & { id: string };
export type MessageWithId = MessageDoc & { id: string };

const MESSAGES_LIMIT = 300;

export function useSchoolConversations(schoolId: string | null, archived: boolean) {
  const q = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, "conversations"),
            where("schoolId", "==", schoolId),
            where("archived", "==", archived),
            orderBy("lastAt", "desc"),
            limit(200),
          )
        : null,
    [schoolId, archived],
  );
  return useQueryData<ConversationDoc>(q);
}

export function useStudentConversations(uid: string | undefined) {
  const q = useMemo(
    () =>
      uid
        ? query(
            collection(db, "conversations"),
            where("studentUid", "==", uid),
            orderBy("lastAt", "desc"),
            limit(50),
          )
        : null,
    [uid],
  );
  return useQueryData<ConversationDoc>(q);
}

/** Nombre de conversations avec des messages non lus (badge de la barre latérale). */
export function useUnreadConversations(side: ChatSide, id: string | null | undefined): number {
  const q = useMemo(() => {
    if (!id) return null;
    const [field, counter] =
      side === "school" ? ["schoolId", "unreadForSchool"] : ["studentUid", "unreadForStudent"];
    return query(
      collection(db, "conversations"),
      where(field, "==", id),
      where(counter, ">", 0),
      limit(100),
    );
  }, [side, id]);
  return useQueryData<ConversationDoc>(q).data.length;
}

export function useConversation(conversationId: string | undefined) {
  const ref = useMemo(
    () => (conversationId ? doc(db, paths.conversation(conversationId)) : null),
    [conversationId],
  );
  return useDocData<ConversationDoc>(ref);
}

/** Derniers messages, du plus ancien au plus récent. */
export function useMessages(conversationId: string | undefined) {
  const q = useMemo(
    () =>
      conversationId
        ? query(
            collection(db, paths.messages(conversationId)),
            orderBy("createdAt", "desc"),
            limit(MESSAGES_LIMIT),
          )
        : null,
    [conversationId],
  );
  const state = useQueryData<MessageDoc>(q);
  const messages = useMemo(() => [...state.data].reverse(), [state.data]);
  return { ...state, data: messages };
}

export async function sendMessage(
  conversationId: string,
  author: { uid: string; name: string },
  body: string,
): Promise<void> {
  await addDoc(collection(db, paths.messages(conversationId)), {
    authorUid: author.uid,
    authorName: author.name.slice(0, 80) || "Membre",
    body,
    createdAt: serverTimestamp(),
  });
}

/** Conversation lue : compteur de son côté à zéro, notification de la cloche marquée lue. */
export async function markConversationRead(
  conversation: ConversationWithId,
  side: ChatSide,
  uid: string,
): Promise<void> {
  const counter = side === "school" ? "unreadForSchool" : "unreadForStudent";
  if (conversation[counter] === 0) return;
  await Promise.all([
    updateDoc(doc(db, paths.conversation(conversation.id)), { [counter]: 0 }),
    // La notification peut ne pas exister (sourdine, ou déjà supprimée).
    updateDoc(doc(db, `users/${uid}/notifications/message_${conversation.id}`), {
      read: true,
    }).catch(() => undefined),
  ]);
}

/** Le dernier message vient-il de mon côté (« Vous : … ») ? */
export function lastFromMe(conversation: ConversationDoc, side: ChatSide): boolean {
  const author = conversation.lastMessage?.authorUid;
  if (!author) return false;
  return side === "student"
    ? author === conversation.studentUid
    : author !== conversation.studentUid;
}

export interface MessageGroup<M> {
  day: Date;
  items: { message: M; showHeader: boolean }[];
}

/** Au-delà de ce délai, un nouveau message du même auteur réaffiche son nom. */
const SAME_RUN_MS = 10 * 60 * 1000;

/**
 * Messages regroupés par jour ; dans un jour, les messages consécutifs d'un même auteur
 * (à moins de 10 min d'écart) n'affichent qu'une fois le nom et l'heure.
 * Un message en cours d'envoi (date du serveur pas encore connue) compte pour maintenant.
 */
export function groupMessages<
  M extends { authorUid: string; createdAt: TimestampLike | Date | null },
>(messages: M[], now = new Date()): MessageGroup<M>[] {
  const groups: MessageGroup<M>[] = [];
  let previous: { author: string; at: Date } | null = null;
  for (const message of messages) {
    const at = toDate(message.createdAt) ?? now;
    const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
    let group = groups.at(-1);
    if (!group || group.day.getTime() !== day.getTime()) {
      group = { day, items: [] };
      groups.push(group);
      previous = null;
    }
    const showHeader =
      !previous ||
      previous.author !== message.authorUid ||
      at.getTime() - previous.at.getTime() > SAME_RUN_MS;
    group.items.push({ message, showHeader });
    previous = { author: message.authorUid, at };
  }
  return groups;
}
