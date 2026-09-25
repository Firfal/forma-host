"use client";

import { useLoadedCourse } from "@/components/course/admin-course-context";
import { SalesPageEditor } from "@/components/sales/sales-page-editor";

export default function CourseSalesPageEditorPage() {
  const course = useLoadedCourse();
  return <SalesPageEditor course={course} />;
}
