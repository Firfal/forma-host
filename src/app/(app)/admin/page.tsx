"use client";

import { collection, collectionGroup, limit, orderBy, query, where } from "firebase/firestore";
import { MessageSquare, PlayCircle, UserPlus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { completedCount, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CommentDoc, CourseDoc, EnrollmentDoc } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { buildActivity, groupByDay, type ActivityEvent } from "@/lib/activity";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

const DAY = 86_400_000;

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p
        className="text-[13px] text-muted underline decoration-line decoration-dotted underline-offset-4"
        title={hint}
      >
        {label}
      </p>
      <p className="mt-2 text-base font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

const icons = { joined: UserPlus, watched: PlayCircle, commented: MessageSquare };
const iconTone = {
  joined: "bg-brand-soft text-brand",
  watched: "bg-info-soft text-info",
  commented: "bg-success-soft text-success",
};

function ActivityLine({ event }: { event: ActivityEvent }) {
  const Icon = icons[event.kind];
  const time = event.at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const href =
    event.kind === "commented" && event.lessonId
      ? routes.lesson(event.courseId, event.lessonId)
      : routes.adminCourse(event.courseId);
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${iconTone[event.kind]}`}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-semibold">{event.who}</span>{" "}
          <span className="text-muted">
            {event.kind === "joined"
              ? "a rejoint"
              : event.kind === "watched"
                ? "a regardé"
                : "a commenté"}
          </span>{" "}
          <Link href={href} className="font-medium hover:underline">
            {event.kind === "joined" ? event.courseTitle : event.lessonTitle}
          </Link>{" "}
          <span className="text-[12px] text-muted">{time}</span>
        </p>
        {event.excerpt ? (
          <p className="mt-0.5 truncate text-[13px] text-muted">« {event.excerpt} »</p>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminHomePage() {
  const { user } = useAuth();
  const uid = user?.uid;
  const enrollmentsQuery = useMemo(
    () => (uid ? query(collection(db, "enrollments"), where("creatorId", "==", uid)) : null),
    [uid],
  );
  const coursesQuery = useMemo(
    () => (uid ? query(collection(db, "courses"), where("creatorId", "==", uid)) : null),
    [uid],
  );
  const commentsQuery = useMemo(
    () =>
      uid
        ? query(
            collectionGroup(db, "comments"),
            where("creatorId", "==", uid),
            orderBy("createdAt", "desc"),
            limit(50),
          )
        : null,
    [uid],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const { data: courses } = useQueryData<CourseDoc>(coursesQuery);
  const { data: comments } = useQueryData<CommentDoc>(commentsQuery);

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const kpis = useMemo(() => {
    const now = Date.now();
    const active = enrollments.filter((e) => e.status === "active");
    const percents = active.map((e) => {
      const course = courseMap.get(e.courseId);
      const total = course ? visibleLessons(course.items).length : 0;
      return total && course
        ? completedCount(course.items, e.progress.completedLessonIds) / total
        : 0;
    });
    return {
      students: new Set(active.map((e) => e.uid)).size,
      newEnrollments: active.filter((e) => (toDate(e.joinedAt)?.getTime() ?? 0) > now - 30 * DAY)
        .length,
      activeWeek: new Set(
        active
          .filter((e) => (toDate(e.progress.lastActivityAt)?.getTime() ?? 0) > now - 7 * DAY)
          .map((e) => e.uid),
      ).size,
      average: percents.length
        ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 100)
        : 0,
      comments: comments.filter(
        (c) => c.authorUid !== uid && (toDate(c.createdAt)?.getTime() ?? 0) > now - 30 * DAY,
      ).length,
    };
  }, [enrollments, courseMap, comments, uid]);

  const activity = useMemo(
    () =>
      uid ? groupByDay(buildActivity(enrollments, comments, courseMap, { creatorId: uid })) : [],
    [enrollments, comments, courseMap, uid],
  );

  return (
    <PageContainer>
      <PageHeader title="Accueil" />
      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Élèves" value={kpis.students} hint="Élèves ayant au moins un accès actif" />
          <Kpi
            label="Inscriptions"
            value={kpis.newEnrollments}
            hint="Nouvelles inscriptions sur 30 jours"
          />
          <Kpi
            label="Actifs (7 j)"
            value={kpis.activeWeek}
            hint="Élèves ayant ouvert une leçon cette semaine"
          />
          <Kpi
            label="Progression"
            value={`${kpis.average} %`}
            hint="Progression moyenne des élèves actifs"
          />
          <Kpi
            label="Commentaires"
            value={kpis.comments}
            hint="Commentaires d'élèves sur 30 jours"
          />
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
        </CardHeader>
        <CardBody>
          {activity.length === 0 && !loading ? (
            <EmptyState
              title="Pas encore d'activité"
              description="Les inscriptions, leçons regardées et commentaires de tes élèves apparaîtront ici."
            />
          ) : (
            <div className="space-y-2">
              {activity.map((group) => (
                <section key={group.label}>
                  <div className="flex items-center gap-3 text-[13px] text-muted">
                    <span>{group.label}</span>
                    <span className="h-px flex-1 bg-line-soft" />
                  </div>
                  <ul>
                    {group.events.map((event) => (
                      <ActivityLine key={event.id} event={event} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </PageContainer>
  );
}
