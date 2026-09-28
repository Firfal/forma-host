import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { useMemo } from "react";
import { buildIcs, type LiveDoc, type LiveInput } from "@shared/lives";
import type { TimestampLike } from "@shared/types";
import { db } from "./firebase/client";
import { toDate } from "./format";
import { useQueryData } from "./hooks";

export type Live = LiveDoc<TimestampLike> & { id: string; start: Date };

/** Directs d'une formation, du plus ancien au plus récent. */
export function useLives(courseId: string, enabled = true) {
  const livesQuery = useMemo(
    () =>
      enabled
        ? query(collection(db, "courses", courseId, "lives"), orderBy("startsAt", "asc"))
        : null,
    [courseId, enabled],
  );
  const { data, loading } = useQueryData<LiveDoc<TimestampLike>>(livesQuery);
  const lives: Live[] = data.flatMap((live) => {
    const start = toDate(live.startsAt);
    return start ? [{ ...live, start }] : [];
  });
  return { lives, loading };
}

export async function createLive(course: { id: string; creatorId: string }, input: LiveInput) {
  await addDoc(collection(db, "courses", course.id, "lives"), {
    creatorId: course.creatorId,
    courseId: course.id,
    title: input.title,
    description: input.description,
    startsAt: Timestamp.fromDate(input.startsAt),
    durationMin: input.durationMin,
    joinUrl: input.joinUrl,
    replayUrl: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function setLiveReplay(courseId: string, liveId: string, replayUrl: string | null) {
  await updateDoc(doc(db, "courses", courseId, "lives", liveId), {
    replayUrl,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteLive(courseId: string, liveId: string) {
  await deleteDoc(doc(db, "courses", courseId, "lives", liveId));
}

/** Télécharge le fichier agenda (.ics) du direct. */
export function downloadIcs(live: Live, courseTitle: string) {
  const ics = buildIcs({
    id: live.id,
    title: live.title,
    description: live.description,
    startsAt: live.start,
    durationMin: live.durationMin,
    joinUrl: live.joinUrl,
    courseTitle,
  });
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "direct.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
