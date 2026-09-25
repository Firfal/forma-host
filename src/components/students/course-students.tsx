"use client";

import type { CourseWithId } from "@/lib/courses";

export function CourseStudents({ course }: { course: CourseWithId }) {
  return <p className="text-muted">Élèves de « {course.title} » : bientôt.</p>;
}
