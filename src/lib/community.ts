import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useMemo } from "react";
import type { CommunityDoc } from "@shared/community";
import type { EnrollmentDoc } from "@shared/types";
import { useAuth } from "./auth";
import { db } from "./firebase/client";
import { useQueryData } from "./hooks";

export interface Author {
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
}

export async function createPost(schoolId: string, author: Author, body: string) {
  await addDoc(collection(db, "communities", schoolId, "posts"), {
    ...author,
    body,
    pinned: false,
    replyCount: 0,
    lastReplyAt: null,
    createdAt: serverTimestamp(),
  });
}

export async function createReply(schoolId: string, postId: string, author: Author, body: string) {
  await addDoc(collection(db, "communities", schoolId, "posts", postId, "replies"), {
    ...author,
    body,
    createdAt: serverTimestamp(),
  });
}

export async function deletePost(schoolId: string, postId: string) {
  await deleteDoc(doc(db, "communities", schoolId, "posts", postId));
}

export async function deleteReply(schoolId: string, postId: string, replyId: string) {
  await deleteDoc(doc(db, "communities", schoolId, "posts", postId, "replies", replyId));
}

export async function setPinned(schoolId: string, postId: string, pinned: boolean) {
  await updateDoc(doc(db, "communities", schoolId, "posts", postId), { pinned });
}

/** Écoles dont l'élève a une communauté ouverte (d'après ses inscriptions actives). */
export function useMyCommunities(): { schoolIds: string[]; loading: boolean } {
  const { user } = useAuth();
  const enrollmentsQuery = useMemo(
    () =>
      user
        ? query(
            collection(db, "enrollments"),
            where("uid", "==", user.uid),
            where("status", "==", "active"),
          )
        : null,
    [user],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const schoolIds = [...new Set(enrollments.map((e) => e.creatorId))].sort();
  const key = schoolIds.join("|");
  const communitiesQuery = useMemo(
    () =>
      key
        ? query(
            collection(db, "communities"),
            where(documentId(), "in", key.split("|").slice(0, 30)),
          )
        : null,
    [key],
  );
  const { data: communities, loading: communitiesLoading } =
    useQueryData<CommunityDoc>(communitiesQuery);
  return {
    schoolIds: communities.filter((c) => c.enabled).map((c) => c.id),
    loading: loading || communitiesLoading,
  };
}
