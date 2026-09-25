"use client";

import { useLoadedCourse } from "@/components/course/admin-course-context";
import { OutlineEditor } from "@/components/course/outline-editor";

export default function CourseContentPage() {
  const course = useLoadedCourse();
  return (
    <div className="max-w-4xl">
      <OutlineEditor course={course} />
    </div>
  );
}
