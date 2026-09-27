import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentReference,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { useEffect, useMemo, useState } from "react";
import type { SubmissionDoc, SubmissionFile, SubmissionStatus } from "@shared/exercises";
import { storagePaths } from "@shared/paths";
import { db, storage } from "./firebase/client";
import { useQueryData } from "./hooks";
import { deleteFile, safeFileName } from "./storage";

/** Envoie le fichier d'un exercice (progression de 0 à 1). */
export async function uploadSubmissionFile(
  courseId: string,
  uid: string,
  file: File,
  onProgress: (ratio: number) => void,
): Promise<SubmissionFile> {
  const path = storagePaths.submission(courseId, uid, safeFileName(file.name));
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type || "application/octet-stream",
    contentDisposition: `inline; filename="${encodeURIComponent(file.name)}"`,
  });
  task.on("state_changed", (snap) =>
    onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
  );
  await task;
  return { path, name: file.name, size: file.size, contentType: file.type };
}

export async function createSubmission(
  data: Pick<
    SubmissionDoc,
    | "courseId"
    | "creatorId"
    | "lessonId"
    | "lessonTitle"
    | "uid"
    | "studentName"
    | "file"
    | "link"
    | "note"
  >,
): Promise<DocumentReference> {
  return addDoc(collection(db, "submissions"), {
    ...data,
    status: "submitted",
    createdAt: serverTimestamp(),
    reviewedAt: null,
    lastFeedbackAt: null,
  });
}

/** L'élève retire un exercice pas encore corrigé (et son fichier). */
export async function deleteSubmission(id: string, submission: SubmissionDoc): Promise<void> {
  await deleteDoc(doc(db, "submissions", id));
  if (submission.file) await deleteFile(submission.file.path).catch(() => undefined);
}

export async function setSubmissionStatus(id: string, status: SubmissionStatus): Promise<void> {
  await updateDoc(doc(db, "submissions", id), {
    status,
    reviewedAt: status === "reviewed" ? serverTimestamp() : null,
  });
}

export async function addFeedback(
  submissionId: string,
  feedback: { authorUid: string; authorName: string; atSec: number | null; body: string },
): Promise<void> {
  await addDoc(collection(db, "submissions", submissionId, "feedback"), {
    ...feedback,
    atSec: feedback.atSec == null ? null : Math.floor(feedback.atSec),
    createdAt: serverTimestamp(),
  });
}

export async function deleteFeedback(submissionId: string, feedbackId: string): Promise<void> {
  await deleteDoc(doc(db, "submissions", submissionId, "feedback", feedbackId));
}

/** Adresse de lecture du fichier rendu (les règles vérifient l'élève ou l'équipe). */
export function useSubmissionFileUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    getDownloadURL(ref(storage, path))
      .then((next) => !cancelled && setUrl({ path, url: next }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path]);
  return url && url.path === path ? url.url : null;
}

/** Nombre d'exercices à corriger dans l'école (badge de la barre latérale). */
export function usePendingSubmissions(schoolId: string | null | undefined): number {
  const pendingQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, "submissions"),
            where("creatorId", "==", schoolId),
            where("status", "==", "submitted"),
          )
        : null,
    [schoolId],
  );
  return useQueryData<SubmissionDoc>(pendingQuery).data.length;
}
