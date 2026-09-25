"use client";

import { useLoadedCourse } from "@/components/course/admin-course-context";
import { CourseStudents } from "@/components/students/course-students";

export default function CourseStudentsPage() {
  const course = useLoadedCourse();
  return <CourseStudents course={course} />;
}
