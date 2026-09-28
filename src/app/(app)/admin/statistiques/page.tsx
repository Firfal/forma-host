"use client";

import { collection, query, where } from "firebase/firestore";
import { TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { sameStripeMode, type OrderDoc } from "@shared/payments";
import {
  biggestDrop,
  courseStats,
  lastMonths,
  lessonFunnel,
  sumByMonth,
  type StatsEnrollment,
} from "@shared/stats";
import type { CourseDoc, EnrollmentDoc, TimestampLike } from "@shared/types";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { SatisfactionCard } from "@/components/stats/satisfaction-card";
import { PageContainer } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchoolPayments } from "@/lib/payments";
import { useSchool } from "@/lib/school";

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    notation: cents >= 1_000_000 ? "compact" : "standard",
  }).format(cents / 100);
const count = (value: number) => new Intl.NumberFormat("fr-FR").format(Math.round(value));

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[13px] text-muted" title={hint}>
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold">{value}</p>
    </Card>
  );
}

export default function StatisticsPage() {
  const { schoolId } = useSchool();
  const { livemode, enabled: paymentsEnabled } = useSchoolPayments(schoolId);
  const [months, setMonths] = useState(12);
  const [courseId, setCourseId] = useState("all");

  const ordersQuery = useMemo(
    () => (schoolId ? query(collection(db, "orders"), where("schoolId", "==", schoolId)) : null),
    [schoolId],
  );
  const enrollmentsQuery = useMemo(
    () =>
      schoolId ? query(collection(db, "enrollments"), where("creatorId", "==", schoolId)) : null,
    [schoolId],
  );
  const coursesQuery = useMemo(
    () => (schoolId ? query(collection(db, "courses"), where("creatorId", "==", schoolId)) : null),
    [schoolId],
  );
  const { data: orderDocs, loading: ordersLoading } =
    useQueryData<OrderDoc<TimestampLike>>(ordersQuery);
  const { data: enrollmentDocs, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const { data: courses } = useQueryData<CourseDoc>(coursesQuery);

  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  );
  const sortedCourses = useMemo(
    () => [...courses].sort((a, b) => a.title.localeCompare(b.title, "fr")),
    [courses],
  );
  const period = useMemo(() => lastMonths(new Date(), months), [months]);
  const since = useMemo(() => {
    const [year, month] = period[0].key.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [period]);

  const view = useMemo(() => {
    const inCourse = (id: string) => courseId === "all" || id === courseId;
    // Le chiffre d'affaires ne mélange pas ventes de test et ventes réelles.
    const orders = orderDocs
      .filter((order) => inCourse(order.courseId) && sameStripeMode(order.livemode, livemode))
      .map((order) => ({
        courseId: order.courseId,
        amount: order.amount,
        status: order.status,
        at: toDate(order.createdAt),
      }));
    const paid = orders.filter((order) => order.status === "paid");
    const paidInPeriod = paid.filter((order) => order.at && order.at >= since);
    const enrollments: StatsEnrollment[] = enrollmentDocs
      .filter((enrollment) => inCourse(enrollment.courseId))
      .map((enrollment) => ({
        courseId: enrollment.courseId,
        uid: enrollment.uid,
        status: enrollment.status,
        joinedAt: toDate(enrollment.joinedAt),
        completedLessonIds: enrollment.progress.completedLessonIds,
        certificateId: enrollment.certificateId ?? null,
      }));
    const perCourse = sortedCourses
      .filter((course) => inCourse(course.id))
      .map((course) => ({
        course,
        stats: courseStats(
          course.items,
          enrollments.filter((enrollment) => enrollment.courseId === course.id),
        ),
        revenue: paidInPeriod
          .filter((order) => order.courseId === course.id)
          .reduce((sum, order) => sum + order.amount, 0),
      }));
    const students = perCourse.reduce((sum, row) => sum + row.stats.students, 0);
    const completed = perCourse.reduce((sum, row) => sum + row.stats.completed, 0);
    // Décrochage : formation choisie, sinon celle qui a le plus d'élèves.
    const funnelCourse =
      courseId === "all"
        ? [...perCourse].sort((a, b) => b.stats.students - a.stats.students)[0]?.course
        : perCourse[0]?.course;
    const funnel = funnelCourse
      ? lessonFunnel(
          funnelCourse.items,
          enrollments.filter((enrollment) => enrollment.courseId === funnelCourse.id),
        )
      : [];
    return {
      revenue: paidInPeriod.reduce((sum, order) => sum + order.amount, 0),
      sales: paidInPeriod.length,
      newStudents: enrollments.filter(
        (enrollment) => enrollment.joinedAt && enrollment.joinedAt >= since,
      ).length,
      completionRate: students ? Math.round((completed / students) * 100) : 0,
      certificates: perCourse.reduce((sum, row) => sum + row.stats.certificates, 0),
      revenueByMonth: sumByMonth(
        paid,
        period,
        (order) => order.at,
        (order) => order.amount,
      ),
      studentsByMonth: sumByMonth(
        enrollments,
        period,
        (enrollment) => enrollment.joinedAt,
        () => 1,
      ),
      perCourse,
      funnelCourse,
      funnel,
      drop: biggestDrop(funnel),
    };
  }, [orderDocs, enrollmentDocs, sortedCourses, courseId, livemode, period, since]);

  const showSales = paymentsEnabled || orderDocs.length > 0;

  return (
    <PageContainer>
      <PageHeader title="Statistiques" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Période"
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
          className="w-auto"
        >
          <option value={6}>6 derniers mois</option>
          <option value={12}>12 derniers mois</option>
          <option value={24}>24 derniers mois</option>
        </Select>
        <Select
          aria-label="Formation"
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
          className="w-auto max-w-72"
        >
          <option value="all">Toutes les formations</option>
          {sortedCourses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
            </option>
          ))}
        </Select>
        {showSales && !livemode ? <Badge tone="info">Ventes de test</Badge> : null}
      </div>

      {loading || ordersLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : enrollmentDocs.length === 0 && orderDocs.length === 0 ? (
        <EmptyState
          title="Pas encore de données"
          description="Les ventes, inscriptions et progressions de tes élèves apparaîtront ici."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {showSales ? (
              <>
                <StatTile
                  label="Chiffre d'affaires"
                  value={euros(view.revenue)}
                  hint="Ventes payées sur la période, TTC"
                />
                <StatTile label="Ventes" value={count(view.sales)} />
              </>
            ) : null}
            <StatTile
              label="Nouveaux élèves"
              value={count(view.newStudents)}
              hint="Inscriptions sur la période"
            />
            <StatTile
              label="Formation terminée"
              value={`${view.completionRate} %`}
              hint="Part des élèves actifs ayant terminé toutes les leçons"
            />
            <StatTile label="Certificats" value={count(view.certificates)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {showSales ? (
              <Card>
                <CardHeader>
                  <CardTitle>Chiffre d&apos;affaires par mois</CardTitle>
                </CardHeader>
                <CardBody>
                  <ColumnChart
                    data={view.revenueByMonth}
                    format={euros}
                    title="Chiffre d'affaires par mois"
                    valueLabel="Chiffre d'affaires"
                    emptyText="Aucune vente sur la période."
                  />
                </CardBody>
              </Card>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>Nouveaux élèves par mois</CardTitle>
              </CardHeader>
              <CardBody>
                <ColumnChart
                  data={view.studentsByMonth}
                  format={count}
                  title="Nouveaux élèves par mois"
                  valueLabel="Nouveaux élèves"
                  integer
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Par formation</CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-2 font-medium">Formation</th>
                    <th className="py-2 text-right font-medium">Élèves</th>
                    <th className="py-2 text-right font-medium">Progression moyenne</th>
                    <th className="py-2 text-right font-medium">Terminée</th>
                    {showSales ? (
                      <th className="py-2 text-right font-medium">Chiffre d&apos;affaires</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {view.perCourse.map(({ course, stats, revenue }) => (
                    <tr key={course.id} className="border-b border-line-soft">
                      <td className="max-w-64 truncate py-2 pr-3">{course.title}</td>
                      <td className="py-2 text-right tabular-nums">{count(stats.students)}</td>
                      <td className="py-2 text-right tabular-nums">{stats.averageProgress} %</td>
                      <td className="py-2 text-right tabular-nums">{count(stats.completed)}</td>
                      {showSales ? (
                        <td className="py-2 text-right tabular-nums">{euros(revenue)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {view.funnelCourse && view.funnel.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Où les élèves décrochent</CardTitle>
                <span className="truncate text-[13px] text-muted">{view.funnelCourse.title}</span>
              </CardHeader>
              <CardBody className="space-y-3">
                <p className="text-[13px] text-muted">
                  Part des élèves actifs ayant terminé chaque leçon, dans l&apos;ordre du plan.
                </p>
                {view.drop ? (
                  <p className="flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
                    <TrendingDown className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Plus forte baisse : après « {view.drop.from.title} » (−{view.drop.drop}{" "}
                      points). Une leçon à revoir ?
                    </span>
                  </p>
                ) : null}
                <BarList
                  title="Leçons terminées"
                  rows={view.funnel.map((row) => ({
                    key: row.lessonId,
                    label: row.title,
                    percent: row.percent,
                    detail: `${row.completed} élève${row.completed > 1 ? "s" : ""}`,
                    highlight: view.drop?.to.lessonId === row.lessonId,
                  }))}
                />
              </CardBody>
            </Card>
          ) : null}

          {schoolId ? (
            <SatisfactionCard schoolId={schoolId} courseId={courseId} courseTitles={courseTitles} />
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
