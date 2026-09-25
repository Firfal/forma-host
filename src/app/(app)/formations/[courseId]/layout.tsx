"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { StudentCourseProvider } from "@/components/learn/student-course-context";

export default function StudentCourseLayout({ children }: { children: ReactNode }) {
  const { courseId } = useParams<{ courseId: string }>();
  return <StudentCourseProvider courseId={courseId}>{children}</StudentCourseProvider>;
}
