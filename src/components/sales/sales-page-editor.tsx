"use client";

import type { CourseWithId } from "@/lib/courses";

export function SalesPageEditor({ course }: { course: CourseWithId }) {
  return <p className="text-muted">Page de vente de « {course.title} » : bientôt.</p>;
}
