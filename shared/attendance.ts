import { z } from "zod";

/**
 * Suivi de l'assiduité (Qualiopi, financements OPCO) : temps passé sur les leçons, jour par jour,
 * et avis de fin de formation.
 *
 * enrollments/{id}/activity/{jour} : temps de connexion d'un jour (heure de Paris), écrit par le
 * navigateur de l'élève toutes les minutes d'activité réelle (onglet visible, élève actif).
 */

/** Intervalle d'enregistrement du temps passé (secondes). */
export const HEARTBEAT_SEC = 60;
/** Inactivité au-delà de laquelle le temps n'est plus compté (hors vidéo en lecture). */
export const IDLE_AFTER_MS = 5 * 60_000;
export const ACTIVITY_TIME_ZONE = "Europe/Paris";

export interface ActivityDayDoc<T = unknown> {
  /** AAAA-MM-JJ, heure de Paris (identique à l'identifiant du document). */
  day: string;
  seconds: number;
  /** Leçons ouvertes ce jour-là. */
  lessonIds: string[];
  updatedAt: T;
}

const dayFormatter = new Intl.DateTimeFormat("fr-CA", {
  timeZone: ACTIVITY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour de l'activité (AAAA-MM-JJ, heure de Paris). */
export function activityDay(date: Date): string {
  return dayFormatter.format(date);
}

/** « 2 h 05 », « 12 min », « moins d'une minute ». */
export function formatTimeSpent(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return "moins d'une minute";
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes} min`;
  return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
}

export interface AttendanceSummary {
  totalSeconds: number;
  activeDays: number;
  firstDay: string | null;
  lastDay: string | null;
}

export function attendanceSummary(
  days: Pick<ActivityDayDoc, "day" | "seconds">[],
): AttendanceSummary {
  const sorted = [...days].filter((d) => d.seconds > 0).sort((a, b) => a.day.localeCompare(b.day));
  return {
    totalSeconds: sorted.reduce((sum, d) => sum + d.seconds, 0),
    activeDays: sorted.length,
    firstDay: sorted[0]?.day ?? null,
    lastDay: sorted.at(-1)?.day ?? null,
  };
}

/** « 27 septembre 2026 » depuis AAAA-MM-JJ. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, date!)));
}

// ---------- Avis de fin de formation ----------

/** reviews/{courseId}_{uid} : lisible par l'équipe de l'école et l'élève. */
export interface CourseReviewDoc<T = unknown> {
  courseId: string;
  uid: string;
  creatorId: string;
  studentName: string;
  /** Note de 1 à 5. */
  rating: number;
  /** Recommanderait la formation. */
  recommend: boolean;
  comment: string;
  createdAt: T;
  updatedAt: T;
}

export const courseReviewInput = z.object({
  rating: z.number().int().min(1, "Choisis une note").max(5),
  recommend: z.boolean(),
  comment: z.string().trim().max(2000, "2000 caractères maximum"),
});
export type CourseReviewInput = z.infer<typeof courseReviewInput>;

export const RATING_LABELS = ["", "Décevante", "Moyenne", "Bien", "Très bien", "Excellente"];

export interface ReviewSummary {
  count: number;
  average: number;
  recommendPercent: number;
  /** Nombre d'avis par note, de 5 à 1. */
  distribution: { rating: number; count: number }[];
}

export function reviewSummary(
  reviews: Pick<CourseReviewDoc, "rating" | "recommend">[],
): ReviewSummary {
  const count = reviews.length;
  return {
    count,
    average: count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0,
    recommendPercent: count
      ? Math.round((reviews.filter((r) => r.recommend).length / count) * 100)
      : 0,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((r) => r.rating === rating).length,
    })),
  };
}

/** L'avis est proposé à partir de la moitié de la formation (évaluation « à chaud »). */
export function shouldAskReview(done: number, total: number): boolean {
  return total > 0 && done / total >= 0.5;
}
