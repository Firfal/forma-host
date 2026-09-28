import { arrayUnion, doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef } from "react";
import { HEARTBEAT_SEC, IDLE_AFTER_MS, activityDay } from "@shared/attendance";
import { db } from "./firebase/client";

/**
 * Temps passé sur une leçon (assiduité) : une minute est comptée si l'onglet est visible et que
 * l'élève a interagi récemment ou que la vidéo tourne. Un second onglet ne double pas le compte
 * (les règles refusent deux écritures à moins de 50 s).
 */
export function useActivityTracker(enrollmentId: string | null, lessonId: string) {
  const lastInteraction = useRef(Date.now());
  const videoUntil = useRef(0);

  useEffect(() => {
    if (!enrollmentId) return;
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    const timer = window.setInterval(() => {
      const now = Date.now();
      const active = now - lastInteraction.current < IDLE_AFTER_MS || now < videoUntil.current;
      if (document.visibilityState !== "visible" || !active) return;
      const day = activityDay(new Date(now));
      setDoc(
        doc(db, "enrollments", enrollmentId, "activity", day),
        {
          day,
          seconds: increment(HEARTBEAT_SEC),
          lessonIds: arrayUnion(lessonId),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => undefined);
    }, HEARTBEAT_SEC * 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, touch));
    };
  }, [enrollmentId, lessonId]);

  /** La vidéo est en lecture : l'élève est actif même sans toucher la page. */
  return useCallback(() => {
    videoUntil.current = Date.now() + 90_000;
  }, []);
}
