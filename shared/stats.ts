import { visibleLessons } from "./outline";
import type { OutlineItem } from "./types";

/** Statistiques de l'école (Admin > Statistiques), calculées côté client. */

export interface StatsOrder {
  courseId: string;
  amount: number;
  status: "paid" | "refunded";
  at: Date | null;
}

export interface StatsEnrollment {
  courseId: string;
  uid: string;
  status: string;
  joinedAt: Date | null;
  completedLessonIds: string[];
  certificateId?: string | null;
}

export interface MonthBucket {
  key: string;
  label: string;
  value: number;
}

const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "short" });

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Les `count` derniers mois (le mois en cours inclus), du plus ancien au plus récent. */
export function lastMonths(now: Date, count: number): { key: string; label: string }[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const label = monthLabel.format(date).replace(".", "");
    // Janvier porte l'année, en court (« janv 26 ») pour tenir sous la colonne.
    const year = String(date.getFullYear()).slice(2);
    return { key: monthKey(date), label: date.getMonth() === 0 ? `${label} ${year}` : label };
  });
}

/** Somme par mois (commandes payées : montants ; élèves : 1 par inscription). */
export function sumByMonth<T>(
  items: T[],
  months: { key: string; label: string }[],
  at: (item: T) => Date | null,
  value: (item: T) => number,
): MonthBucket[] {
  const totals = new Map(months.map((month) => [month.key, 0]));
  for (const item of items) {
    const date = at(item);
    if (!date) continue;
    const key = monthKey(date);
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + value(item));
  }
  return months.map((month) => ({ ...month, value: totals.get(month.key) ?? 0 }));
}

export interface CourseStats {
  students: number;
  averageProgress: number;
  completed: number;
  certificates: number;
}

/** Élèves actifs d'une formation, progression moyenne (%), élèves ayant tout terminé. */
export function courseStats(items: OutlineItem[], enrollments: StatsEnrollment[]): CourseStats {
  const lessons = visibleLessons(items);
  const active = enrollments.filter((enrollment) => enrollment.status === "active");
  const ratios = active.map((enrollment) => {
    if (!lessons.length) return 0;
    const done = new Set(enrollment.completedLessonIds);
    return lessons.filter((lesson) => done.has(lesson.id)).length / lessons.length;
  });
  return {
    students: active.length,
    averageProgress: ratios.length
      ? Math.round((ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 100)
      : 0,
    completed: ratios.filter((ratio) => ratio === 1).length,
    certificates: active.filter((enrollment) => enrollment.certificateId).length,
  };
}

export interface LessonFunnelRow {
  lessonId: string;
  title: string;
  completed: number;
  percent: number;
}

/** Part des élèves actifs ayant terminé chaque leçon, dans l'ordre du plan : où ils décrochent. */
export function lessonFunnel(
  items: OutlineItem[],
  enrollments: StatsEnrollment[],
): LessonFunnelRow[] {
  const active = enrollments.filter((enrollment) => enrollment.status === "active");
  const sets = active.map((enrollment) => new Set(enrollment.completedLessonIds));
  return visibleLessons(items).map((lesson) => {
    const completed = sets.filter((set) => set.has(lesson.id)).length;
    return {
      lessonId: lesson.id,
      title: lesson.title,
      completed,
      percent: active.length ? Math.round((completed / active.length) * 100) : 0,
    };
  });
}

/** Plus forte baisse entre deux leçons consécutives (null si aucune). */
export function biggestDrop(
  rows: LessonFunnelRow[],
): { from: LessonFunnelRow; to: LessonFunnelRow; drop: number } | null {
  let best: { from: LessonFunnelRow; to: LessonFunnelRow; drop: number } | null = null;
  for (let index = 1; index < rows.length; index++) {
    const drop = rows[index - 1].percent - rows[index].percent;
    if (drop > 0 && (!best || drop > best.drop)) {
      best = { from: rows[index - 1], to: rows[index], drop };
    }
  }
  return best;
}

/** Graduation « propre » de l'axe : 0, puis un maximum arrondi (1, 2, 2,5 ou 5 × 10ⁿ). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}
