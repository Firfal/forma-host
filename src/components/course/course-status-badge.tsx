import type { CourseDoc } from "@shared/types";
import { Badge } from "@/components/ui/badge";

export function CourseStatusBadges({
  course,
}: {
  course: Pick<CourseDoc, "status" | "visibility">;
}) {
  return (
    <span className="inline-flex gap-1">
      {course.status === "published" ? (
        <Badge tone="brand">Publiée</Badge>
      ) : (
        <Badge>Brouillon</Badge>
      )}
      {course.visibility === "hidden" ? <Badge tone="warning">Masquée</Badge> : null}
    </span>
  );
}
