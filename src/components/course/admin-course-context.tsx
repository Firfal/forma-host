"use client";

import { doc } from "firebase/firestore";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CourseDoc } from "@shared/types";
import type { CourseWithId } from "@/lib/courses";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

interface AdminCourseState {
  course: CourseWithId | null;
  loading: boolean;
  error: Error | null;
}

const AdminCourseContext = createContext<AdminCourseState | null>(null);

/** Formation en temps réel, partagée par les onglets de l'éditeur. */
export function AdminCourseProvider({
  courseId,
  children,
}: {
  courseId: string;
  children: ReactNode;
}) {
  const ref = useMemo(() => doc(db, "courses", courseId), [courseId]);
  const { data, loading, error } = useDocData<CourseDoc>(ref);
  const value = useMemo(() => ({ course: data, loading, error }), [data, loading, error]);
  return <AdminCourseContext.Provider value={value}>{children}</AdminCourseContext.Provider>;
}

export function useAdminCourse(): AdminCourseState {
  const context = useContext(AdminCourseContext);
  if (!context) throw new Error("useAdminCourse doit être utilisé dans <AdminCourseProvider>");
  return context;
}

/** Variante pour les pages qui ne s'affichent qu'une fois la formation chargée. */
export function useLoadedCourse(): CourseWithId {
  const { course } = useAdminCourse();
  if (!course) throw new Error("Formation non chargée");
  return course;
}
