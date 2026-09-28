"use client";

import { collection, doc } from "firebase/firestore";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  attendanceSummary,
  formatDay,
  formatTimeSpent,
  type ActivityDayDoc,
} from "@shared/attendance";
import type { SchoolLegalDoc } from "@shared/legal";
import { completedCount, visibleLessons } from "@shared/outline";
import type { CourseDoc, EnrollmentDoc } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";

/**
 * Attestation d'assiduité d'un élève (Qualiopi, OPCO) : temps de connexion, progression, relevé
 * jour par jour. Pour l'élève et l'équipe de l'école, imprimable en PDF.
 */
export default function AttendancePage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const router = useRouter();
  const enrollmentRef = useMemo(() => doc(db, "enrollments", enrollmentId), [enrollmentId]);
  const { data: enrollment, loading } = useDocData<EnrollmentDoc>(enrollmentRef);
  const courseRef = useMemo(
    () => (enrollment ? doc(db, "courses", enrollment.courseId) : null),
    [enrollment],
  );
  const legalRef = useMemo(
    () => (enrollment ? doc(db, "creators", enrollment.creatorId, "legal", "info") : null),
    [enrollment],
  );
  const activityQuery = useMemo(
    () => (enrollment ? collection(db, "enrollments", enrollmentId, "activity") : null),
    [enrollment, enrollmentId],
  );
  const { data: course } = useDocData<CourseDoc>(courseRef);
  const { data: legal, loading: legalLoading } = useDocData<SchoolLegalDoc>(legalRef);
  const { data: days } = useQueryData<ActivityDayDoc>(activityQuery);

  const summary = attendanceSummary(days);
  const sortedDays = [...days]
    .filter((d) => d.seconds > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  const total = course ? visibleLessons(course.items).length : 0;
  const done =
    course && enrollment ? completedCount(course.items, enrollment.progress.completedLessonIds) : 0;
  const quizzes = Object.entries(enrollment?.quizResults ?? {}).map(([lessonId, result]) => ({
    title: course?.items.find((item) => item.id === lessonId)?.title ?? "Quiz",
    result,
  }));
  const studentName = enrollment?.displayName || enrollment?.email;
  const ready = Boolean(enrollment && course && legal);

  return (
    <div className="min-h-dvh bg-surface px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft /> Retour
        </Button>
        {ready ? (
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Télécharger en PDF
          </Button>
        ) : null}
      </div>

      {loading || legalLoading ? (
        <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-line bg-white p-8">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-40" />
        </div>
      ) : !enrollment ? (
        <p className="text-center text-sm text-muted">Inscription introuvable.</p>
      ) : !legal ? (
        <p className="mx-auto max-w-md text-center text-sm text-muted">
          L&apos;attestation sera disponible quand l&apos;école aura complété ses informations
          légales (Paramètres &gt; Informations légales).
        </p>
      ) : (
        <article className="mx-auto max-w-3xl rounded-lg border border-line bg-white p-8 text-[13px] leading-5 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none md:p-12">
          <header>
            <p className="text-base font-semibold">{legal.companyName}</p>
            <p className="text-muted">{legal.legalForm}</p>
            <p>{legal.address}</p>
            <p>
              {legal.siret.length === 14 ? "SIRET" : "SIREN"} {legal.siret}
            </p>
            {legal.trainingNumber ? (
              <p>Déclaration d&apos;activité n° {legal.trainingNumber}</p>
            ) : null}
            <p>{legal.contactEmail}</p>
          </header>

          <h1 className="mt-10 text-center text-xl font-bold tracking-tight">
            Attestation d&apos;assiduité
          </h1>

          <p className="mt-8 text-[14px] leading-6">
            Je soussigné(e) {legal.publisherName}, pour {legal.companyName}, atteste que{" "}
            <strong>{studentName}</strong> a suivi à distance la formation{" "}
            <strong>« {course?.title} »</strong>
            {summary.firstDay && summary.lastDay
              ? summary.firstDay === summary.lastDay
                ? `, le ${formatDay(summary.firstDay)}`
                : `, du ${formatDay(summary.firstDay)} au ${formatDay(summary.lastDay)}`
              : ""}
            .
          </p>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ["Inscription", formatDate(enrollment.joinedAt)],
              ["Temps de connexion aux leçons", formatTimeSpent(summary.totalSeconds)],
              ["Jours de connexion", String(summary.activeDays)],
              [
                "Leçons terminées",
                `${done} sur ${total} (${total ? Math.round((done / total) * 100) : 0} %)`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-line-soft px-3 py-2">
                <dt className="text-[12px] text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {quizzes.length ? (
            <section className="mt-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                Évaluations
              </h2>
              <ul className="mt-2 divide-y divide-line-soft border-y border-line-soft">
                {quizzes.map(({ title, result }) => (
                  <li key={title} className="flex justify-between gap-4 py-1.5">
                    <span>Quiz « {title} »</span>
                    <span className="tabular-nums">
                      {result.bestPercent} % · {result.passed ? "réussi" : "non réussi"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-6 break-inside-avoid">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted">
              Relevé de connexion
            </h2>
            {sortedDays.length === 0 ? (
              <p className="mt-2 text-muted">Aucune connexion enregistrée.</p>
            ) : (
              <table className="mt-2 w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-1.5 font-medium">Date</th>
                    <th className="py-1.5 text-right font-medium">Leçons ouvertes</th>
                    <th className="py-1.5 text-right font-medium">Temps</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDays.map((day) => (
                    <tr key={day.day} className="border-b border-line-soft">
                      <td className="py-1.5">{formatDay(day.day)}</td>
                      <td className="py-1.5 text-right tabular-nums">{day.lessonIds.length}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {formatTimeSpent(day.seconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <footer className="mt-10 flex flex-wrap items-end justify-between gap-6">
            <p className="text-[12px] text-muted">
              Temps mesuré sur la plateforme de formation : leçons ouvertes, onglet actif, élève
              actif. Édité le {formatDate(new Date())}.
            </p>
            <div className="w-56 text-center">
              <p className="text-[12px] text-muted">Pour {legal.companyName}</p>
              <div className="mt-2 h-16 border-b border-line" />
              <p className="mt-1 text-[12px]">{legal.publisherName}</p>
            </div>
          </footer>
        </article>
      )}
    </div>
  );
}
