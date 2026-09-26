import type { CommentDoc, CourseDoc, EnrollmentDoc, TimestampLike } from "@shared/types";
import { toDate } from "./format";

export type ActivityKind = "joined" | "watched" | "commented";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: Date;
  who: string;
  courseId: string;
  courseTitle: string;
  lessonId?: string;
  lessonTitle?: string;
  excerpt?: string;
}

type WithId<T> = T & { id: string };

/** Fil d'activité récente : inscriptions, leçons regardées et commentaires, du plus récent au plus ancien. */
export function buildActivity(
  enrollments: WithId<EnrollmentDoc>[],
  comments: WithId<CommentDoc>[],
  courses: Map<string, WithId<CourseDoc>>,
  { staff, limit = 30 }: { staff: Set<string>; limit?: number },
): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const lessonTitle = (courseId: string, lessonId: string | null | undefined) =>
    lessonId ? courses.get(courseId)?.items.find((item) => item.id === lessonId)?.title : undefined;
  const push = (event: Omit<ActivityEvent, "at">, at: TimestampLike | null | undefined) => {
    const date = toDate(at);
    if (date) events.push({ ...event, at: date });
  };

  for (const enrollment of enrollments) {
    const who = enrollment.displayName || enrollment.email;
    const courseTitle = courses.get(enrollment.courseId)?.title ?? "une formation";
    push(
      {
        id: `joined-${enrollment.id}`,
        kind: "joined",
        who,
        courseId: enrollment.courseId,
        courseTitle,
      },
      enrollment.joinedAt,
    );
    const lastLesson = lessonTitle(enrollment.courseId, enrollment.progress.lastLessonId);
    if (lastLesson && enrollment.progress.lastActivityAt) {
      push(
        {
          id: `watched-${enrollment.id}`,
          kind: "watched",
          who,
          courseId: enrollment.courseId,
          courseTitle,
          lessonId: enrollment.progress.lastLessonId ?? undefined,
          lessonTitle: lastLesson,
        },
        enrollment.progress.lastActivityAt,
      );
    }
  }

  for (const comment of comments) {
    if (staff.has(comment.authorUid)) continue;
    push(
      {
        id: `comment-${comment.id}`,
        kind: "commented",
        who: comment.authorName,
        courseId: comment.courseId,
        courseTitle: courses.get(comment.courseId)?.title ?? "une formation",
        lessonId: comment.lessonId,
        lessonTitle: lessonTitle(comment.courseId, comment.lessonId) ?? "une leçon",
        excerpt: comment.body.length > 120 ? `${comment.body.slice(0, 120)}…` : comment.body,
      },
      comment.createdAt,
    );
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** « Aujourd'hui », « Hier », sinon « mardi 19 mai ». */
export function dayLabel(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  const label = dayFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function groupByDay(
  events: ActivityEvent[],
  now = new Date(),
): { label: string; events: ActivityEvent[] }[] {
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(event.at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.events.push(event);
    else groups.push({ label, events: [event] });
  }
  return groups;
}
