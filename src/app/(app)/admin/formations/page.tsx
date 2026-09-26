"use client";

import { collection, orderBy, query, where } from "firebase/firestore";
import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CourseDoc, EnrollmentDoc } from "@shared/types";
import { CourseStatusBadges } from "@/components/course/course-status-badge";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { PageContainer } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchool } from "@/lib/school";
import { NewCourseDialog } from "./new-course-dialog";

export default function AdminCoursesPage() {
  const { schoolId } = useSchool();
  const coursesQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, "courses"),
            where("creatorId", "==", schoolId),
            orderBy("createdAt", "desc"),
          )
        : null,
    [schoolId],
  );
  const enrollmentsQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, "enrollments"),
            where("creatorId", "==", schoolId),
            where("status", "==", "active"),
          )
        : null,
    [schoolId],
  );
  const { data: courses, loading } = useQueryData<CourseDoc>(coursesQuery);
  const { data: enrollments } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const studentsByCourse = useMemo(() => {
    const counts = new Map<string, number>();
    enrollments.forEach((e) => counts.set(e.courseId, (counts.get(e.courseId) ?? 0) + 1));
    return counts;
  }, [enrollments]);

  return (
    <PageContainer>
      <PageHeader
        title="Formations"
        actions={
          <NewCourseDialog>
            <Plus /> Nouvelle formation
          </NewCourseDialog>
        }
      />
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Aucune formation pour l'instant"
          description="Crée ta première formation, ajoute des chapitres et des leçons, puis invite tes élèves."
          action={
            <NewCourseDialog>
              <Plus /> Créer une formation
            </NewCourseDialog>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line-soft text-[13px] text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nom</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Statut</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Leçons</th>
                <th className="px-4 py-2.5 text-right font-medium">Élèves</th>
                <th className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">
                  Créée le
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr
                  key={course.id}
                  className="border-b border-line-soft last:border-0 hover:bg-surface/60"
                >
                  <td className="px-4 py-3">
                    <Link href={routes.adminCourse(course.id)} className="flex items-center gap-3">
                      <CourseThumbnail
                        src={course.thumbnailUrl}
                        title={course.title}
                        className="w-16 rounded"
                      />
                      <span className="font-medium hover:underline">{course.title}</span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <CourseStatusBadges course={course} />
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {visibleLessons(course.items).length}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {studentsByCourse.get(course.id) ?? 0}
                  </td>
                  <td className="hidden px-4 py-3 text-right text-muted lg:table-cell">
                    {formatDate(course.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PageContainer>
  );
}
