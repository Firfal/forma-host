"use client";

import { MessagesSquare, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { completedCount, resumeLesson, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import { CourseThumbnail } from "@/components/course/course-thumbnail";
import { RichText } from "@/components/editor/rich-text";
import { PageContainer } from "@/components/layout/page";
import { CourseOutlineNav } from "@/components/learn/course-outline-nav";
import { NoAccess } from "@/components/learn/no-access";
import { ProgressBar, progressLabel } from "@/components/learn/progress-bar";
import { useStudentCourse } from "@/components/learn/student-course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreator } from "@/lib/creator";
import { callOpenConversation, errorMessage } from "@/lib/firebase/callables";

/** Ouvre (ou crée) la conversation avec l'école de la formation. */
function WriteToSchoolButton({ schoolId }: { schoolId: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  async function open() {
    setOpening(true);
    try {
      const { conversationId } = await callOpenConversation({ schoolId });
      router.push(routes.conversation(conversationId));
    } catch (error) {
      toast.error(errorMessage(error));
      setOpening(false);
    }
  }
  return (
    <Button variant="secondary" className="w-full" onClick={open} disabled={opening}>
      <MessagesSquare /> {opening ? "Ouverture…" : "Écrire au formateur"}
    </Button>
  );
}

export default function StudentCoursePage() {
  const { course, enrollment, hasAccess, isOwner, loading } = useStudentCourse();
  const { data: creator } = useCreator(course?.creatorId);
  const completed = useMemo(() => enrollment?.progress.completedLessonIds ?? [], [enrollment]);
  const completedSet = useMemo(() => new Set(completed), [completed]);

  if (loading) {
    return (
      <PageContainer width="wide">
        <Skeleton className="mb-6 h-7 w-96 max-w-full" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </PageContainer>
    );
  }
  if (!course || !hasAccess) {
    const salesPath =
      course && creator && course.status === "published"
        ? routes.salesPage(creator.slug, course.slug)
        : null;
    return <NoAccess salesPath={salesPath} />;
  }

  const total = visibleLessons(course.items).length;
  const done = completedCount(course.items, completed);
  const next = resumeLesson(course.items, completed, enrollment?.progress.lastLessonId ?? null);

  return (
    <PageContainer width="wide">
      <h1 className="mb-6 text-lg font-semibold">{course.title}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 space-y-6 lg:order-1">
          {course.description ? (
            <Card className="p-4">
              <RichText doc={course.description} />
            </Card>
          ) : null}
          <CourseOutlineNav
            courseId={course.id}
            items={course.items}
            completedIds={completedSet}
            hasAccess={hasAccess}
            variant="cards"
          />
        </div>
        <Card className="order-1 overflow-hidden lg:sticky lg:top-6 lg:order-2">
          <CourseThumbnail src={course.thumbnailUrl} title={course.title} />
          <div className="space-y-3 p-4">
            <Badge tone="brand">Cours</Badge>
            <p className="font-semibold">{course.title}</p>
            {creator ? <p className="text-[13px] text-muted">par {creator.name}</p> : null}
            {isOwner && !enrollment ? (
              <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
                Aperçu formateur : ta progression n&apos;est pas enregistrée.
              </p>
            ) : (
              <div className="space-y-1.5">
                <ProgressBar percent={total ? Math.round((done / total) * 100) : 0} />
                <p className="text-[12px] text-muted">{progressLabel(done, total)}</p>
              </div>
            )}
            {next ? (
              <Button asChild className="w-full">
                <Link href={routes.lesson(course.id, next.id)}>
                  <PlayCircle />{" "}
                  {done === 0 ? "Commencer" : done === total ? "Revoir" : "Continuer"}
                </Link>
              </Button>
            ) : null}
            {!isOwner && enrollment?.status === "active" ? (
              <WriteToSchoolButton schoolId={course.creatorId} />
            ) : null}
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
