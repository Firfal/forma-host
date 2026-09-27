"use client";

import { doc } from "firebase/firestore";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { lessonLocks, type LessonLock } from "@shared/drip";
import { enrollmentId } from "@shared/paths";
import type { CourseDoc, EnrollmentDoc } from "@shared/types";
import { useAuth } from "@/lib/auth";
import type { CourseWithId } from "@/lib/courses";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useDocData } from "@/lib/hooks";

export interface StudentCourseState {
  course: CourseWithId | null;
  enrollment: (EnrollmentDoc & { id: string }) | null;
  /** Le formateur de la formation (aperçu « en élève »). */
  isOwner: boolean;
  /** Inscription active : accès complet et progression. */
  isEnrolled: boolean;
  hasAccess: boolean;
  /** Leçons pas encore ouvertes pour l'élève (ouverture progressive) ; vide pour l'équipe. */
  locks: Map<string, LessonLock>;
  loading: boolean;
}

const StudentCourseContext = createContext<StudentCourseState | null>(null);

export function StudentCourseProvider({
  courseId,
  children,
}: {
  courseId: string;
  children: ReactNode;
}) {
  const { user, schools } = useAuth();
  const courseRef = useMemo(() => doc(db, "courses", courseId), [courseId]);
  const enrollmentRef = useMemo(
    () => (user ? doc(db, "enrollments", enrollmentId(courseId, user.uid)) : null),
    [courseId, user],
  );
  const course = useDocData<CourseDoc>(courseRef);
  const enrollment = useDocData<EnrollmentDoc>(enrollmentRef);

  const value = useMemo<StudentCourseState>(() => {
    // Équipe de l'école (propriétaire ou co-administrateur) : aperçu complet.
    const isOwner = Boolean(user && course.data && schools.includes(course.data.creatorId));
    const isEnrolled = enrollment.data?.status === "active";
    const locks =
      course.data && enrollment.data && isEnrolled && !isOwner
        ? lessonLocks({
            items: course.data.items,
            drip: course.data.drip,
            joinedAt: toDate(enrollment.data.joinedAt),
            completedLessonIds: enrollment.data.progress.completedLessonIds,
          })
        : new Map<string, LessonLock>();
    return {
      course: course.data,
      enrollment: enrollment.data,
      isOwner,
      isEnrolled,
      hasAccess: isOwner || isEnrolled,
      locks,
      loading: course.loading || enrollment.loading,
    };
  }, [user, schools, course.data, course.loading, enrollment.data, enrollment.loading]);

  return <StudentCourseContext.Provider value={value}>{children}</StudentCourseContext.Provider>;
}

export function useStudentCourse(): StudentCourseState {
  const context = useContext(StudentCourseContext);
  if (!context) throw new Error("useStudentCourse doit être utilisé dans <StudentCourseProvider>");
  return context;
}
