"use client";

import { collection, limit, orderBy, query } from "firebase/firestore";
import { useMemo } from "react";
import type { AnnouncementDoc } from "@shared/announcements";
import type { TimestampLike } from "@shared/types";
import { db } from "./firebase/client";
import { useQueryData } from "./hooks";

/** Annonces d'une formation, les plus récentes d'abord. */
export function useAnnouncements(courseId: string | null | undefined, max = 50) {
  const announcementsQuery = useMemo(
    () =>
      courseId
        ? query(
            collection(db, "courses", courseId, "announcements"),
            orderBy("createdAt", "desc"),
            limit(max),
          )
        : null,
    [courseId, max],
  );
  return useQueryData<AnnouncementDoc<TimestampLike>>(announcementsQuery);
}
