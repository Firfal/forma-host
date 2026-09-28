import { FieldValue } from "firebase-admin/firestore";
import { formatLiveDate, type LiveDoc } from "@shared/lives";
import { routes } from "@shared/paths";
import type { CourseDoc, EnrollmentDoc } from "@shared/types";
import { db } from "./db";

/** Nombre d'écritures par lot (limite Firestore : 500). */
const BATCH_SIZE = 400;

/**
 * Direct programmé : notification in-app (et push) à chaque élève inscrit actif. Jamais d'email.
 * ID déterministe : un déclencheur rejoué est sans effet.
 */
export async function handleNewLive(
  courseId: string,
  liveId: string,
  live: LiveDoc<{ toDate(): Date }>,
): Promise<number> {
  const course = (await db().doc(`courses/${courseId}`).get()).data() as CourseDoc | undefined;
  if (!course) return 0;
  const enrollments = await db()
    .collection("enrollments")
    .where("courseId", "==", courseId)
    .where("status", "==", "active")
    .select("uid")
    .get();
  const uids = enrollments.docs.map((doc) => (doc.data() as Pick<EnrollmentDoc, "uid">).uid);
  const when = formatLiveDate(live.startsAt.toDate());
  for (let start = 0; start < uids.length; start += BATCH_SIZE) {
    const batch = db().batch();
    for (const uid of uids.slice(start, start + BATCH_SIZE)) {
      batch.set(db().doc(`users/${uid}/notifications/live_${liveId}`), {
        type: "live_scheduled",
        title: `Direct : ${live.title}`,
        body: `${course.title} · ${when}`,
        link: `${routes.course(courseId)}#directs`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return uids.length;
}
