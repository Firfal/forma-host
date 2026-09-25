"use client";

import { collection, doc, orderBy, query, where } from "firebase/firestore";
import { GraduationCap, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { completedCount, resumeLesson, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CourseDoc, CreatorDoc, EnrollmentDoc } from "@shared/types";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { PageContainer } from "@/components/layout/page";
import { ProgressBar, progressLabel } from "@/components/learn/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase/client";
import { useDocsData, useQueryData } from "@/lib/hooks";

export default function MyCoursesPage() {
  const { user } = useAuth();
  const enrollmentsQuery = useMemo(
    () =>
      user
        ? query(
            collection(db, "enrollments"),
            where("uid", "==", user.uid),
            orderBy("joinedAt", "desc"),
          )
        : null,
    [user],
  );
  const { data: allEnrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const enrollments = allEnrollments.filter((enrollment) => enrollment.status === "active");
  const courseRefs = useMemo(
    () => enrollments.map((enrollment) => doc(db, "courses", enrollment.courseId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrollments.map((enrollment) => enrollment.courseId).join("|")],
  );
  const { data: courses, loading: coursesLoading } = useDocsData<CourseDoc>(courseRefs);
  const creatorRefs = useMemo(
    () => [...new Set(enrollments.map((e) => e.creatorId))].map((id) => doc(db, "creators", id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enrollments.map((enrollment) => enrollment.creatorId).join("|")],
  );
  const { data: creators } = useDocsData<CreatorDoc>(creatorRefs);

  return (
    <PageContainer>
      <PageHeader title="Mes formations" />
      {loading || coursesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : enrollments.length === 0 ? (
        <EmptyState
          icon={<GraduationCap />}
          title="Aucune formation pour le moment"
          description="Quand un formateur te donne accès à une formation, elle apparaît ici. Vérifie aussi tes emails d'invitation."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((enrollment) => {
            const course = courses.get(enrollment.courseId);
            if (!course) return null;
            const total = visibleLessons(course.items).length;
            const done = completedCount(course.items, enrollment.progress.completedLessonIds);
            const next = resumeLesson(
              course.items,
              enrollment.progress.completedLessonIds,
              enrollment.progress.lastLessonId,
            );
            return (
              <Card key={enrollment.id} className="flex flex-col overflow-hidden">
                <Link href={routes.course(course.id)}>
                  <CourseThumbnail src={course.thumbnailUrl} title={course.title} />
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div>
                    <Badge tone="brand">Cours</Badge>
                    <Link
                      href={routes.course(course.id)}
                      className="mt-2 block font-semibold hover:underline"
                    >
                      {course.title}
                    </Link>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {creators.get(course.creatorId)?.name}
                    </p>
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <ProgressBar percent={total ? Math.round((done / total) * 100) : 0} />
                    <p className="text-[12px] text-muted">{progressLabel(done, total)}</p>
                  </div>
                  {next ? (
                    <Button asChild size="sm" className="w-full">
                      <Link href={routes.lesson(course.id, next.id)}>
                        <PlayCircle />{" "}
                        {done === 0 ? "Commencer" : done === total ? "Revoir" : "Continuer"}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
