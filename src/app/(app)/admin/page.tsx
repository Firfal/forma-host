"use client";

import { collection, collectionGroup, limit, orderBy, query, where } from "firebase/firestore";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  Mail,
  MessageSquare,
  MessagesSquare,
  PlayCircle,
  Scale,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { completedCount, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CommentDoc, CourseDoc, EnrollmentDoc } from "@shared/types";
import { SetupCard, useSetupHidden } from "@/components/dashboard/setup-card";
import { PageContainer } from "@/components/layout/page";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { buildActivity, groupByDay, type ActivityEvent } from "@/lib/activity";
import { useUnreadConversations } from "@/lib/chat";
import { useCreator } from "@/lib/creator";
import { usePendingSubmissions } from "@/lib/exercises";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchoolLegal } from "@/lib/legal";
import { useMailSettings } from "@/lib/mail-settings";
import { useSchoolPayments } from "@/lib/payments";
import { useSchool, useSchoolStaff } from "@/lib/school";
import { setupSteps } from "@/lib/setup";

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

interface Todo {
  href: string;
  label: string;
  icon: typeof ClipboardCheck;
}

/**
 * Ce qui attend le formateur : exercices, messages, et informations légales (quand les
 * « Premiers pas », qui les rappellent déjà, ne sont pas affichés).
 */
function TodoCard({ schoolId, showLegal }: { schoolId: string; showLegal: boolean }) {
  const pending = usePendingSubmissions(schoolId);
  const unread = useUnreadConversations("school", schoolId);
  const { data: legal, loading: legalLoading } = useSchoolLegal(schoolId);
  const todos: Todo[] = [
    ...(pending
      ? [
          {
            href: routes.adminExercises,
            label: `${pending} exercice${pending > 1 ? "s" : ""} à corriger`,
            icon: ClipboardCheck,
          },
        ]
      : []),
    ...(unread
      ? [
          {
            href: routes.adminMessages,
            label: `${unread} conversation${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}`,
            icon: MessagesSquare,
          },
        ]
      : []),
    ...(showLegal && !legalLoading && !legal
      ? [
          {
            href: routes.adminSettings,
            label: "Complète tes informations légales (CGV, mentions légales, factures)",
            icon: Scale,
          },
        ]
      : []),
  ];
  if (!todos.length) return null;
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle>À faire</CardTitle>
      </CardHeader>
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {todos.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface/60"
            >
              <Icon className="size-4 shrink-0 text-muted" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Premiers pas du propriétaire de l'école, tant qu'il reste une étape (et qu'il ne les masque pas). */
function useSetup(
  schoolId: string | null,
  courses: (CourseDoc & { id: string })[],
  ready: boolean,
  hasStudents: boolean,
) {
  const { data: creator, loading: creatorLoading } = useCreator(schoolId);
  const { data: legal, loading: legalLoading } = useSchoolLegal(schoolId);
  const payments = useSchoolPayments(schoolId);
  const [hidden, hide] = useSetupHidden(schoolId);
  const steps = useMemo(
    () =>
      setupSteps({
        logoUrl: creator?.logoUrl,
        courses,
        hasLegal: Boolean(legal),
        payments: { enabled: payments.enabled, active: payments.active },
        hasStudents,
      }),
    [creator, courses, legal, payments.enabled, payments.active, hasStudents],
  );
  const loading = !ready || creatorLoading || legalLoading || payments.loading;
  const visible = !loading && !hidden && steps.some((step) => !step.done);
  return { steps, visible, hide };
}

export default function AdminHomePage() {
  const { schoolId: uid, isOwner } = useSchool();
  const staff = useSchoolStaff(uid);
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
  const { data: courses, loading: coursesLoading } = useQueryData<CourseDoc>(coursesQuery);
  const { data: comments } = useQueryData<CommentDoc>(commentsQuery);
  const { data: mailSettings, loading: mailLoading } = useMailSettings(uid);

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
        (c) => !staff.has(c.authorUid) && (toDate(c.createdAt)?.getTime() ?? 0) > now - 30 * DAY,
      ).length,
    };
  }, [enrollments, courseMap, comments, staff]);

  const setup = useSetup(
    isOwner ? uid : null,
    courses,
    isOwner && !loading && !coursesLoading,
    enrollments.length > 0,
  );

  const activity = useMemo(
    () => (uid ? groupByDay(buildActivity(enrollments, comments, courseMap, { staff })) : []),
    [enrollments, comments, courseMap, staff, uid],
  );

  return (
    <PageContainer>
      <PageHeader title="Accueil" />
      {!mailLoading && (!mailSettings || mailSettings.lastError) ? (
        <Link
          href={routes.adminSettings}
          className={`mb-4 flex items-center gap-2.5 rounded-card px-4 py-3 text-[13px] ${
            mailSettings ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
          }`}
        >
          {mailSettings ? (
            <AlertTriangle className="size-4 shrink-0" />
          ) : (
            <Mail className="size-4 shrink-0" />
          )}
          <span className="flex-1">
            {mailSettings
              ? "Des emails n'ont pas pu partir. Vérifie tes réglages d'envoi."
              : "Configure l'envoi des emails pour que tes élèves reçoivent leurs invitations et emails de bienvenue."}
          </span>
          <span className="shrink-0 font-medium">{mailSettings ? "Voir" : "Configurer"} →</span>
        </Link>
      ) : null}
      {setup.visible ? <SetupCard steps={setup.steps} onHide={setup.hide} /> : null}
      {uid ? <TodoCard schoolId={uid} showLegal={!setup.visible} /> : null}
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
