"use client";

import { doc } from "firebase/firestore";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  ListTree,
  Paperclip,
  Square,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AUTO_COMPLETE_RATIO } from "@shared/constants";
import { adjacentLessons, completedCount, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { LessonDoc } from "@shared/types";
import { LessonComments } from "@/components/comments/lesson-comments";
import { RichText } from "@/components/editor/rich-text";
import { CourseOutlineNav } from "@/components/learn/course-outline-nav";
import { NoAccess } from "@/components/learn/no-access";
import { ProgressBar, progressLabel } from "@/components/learn/progress-bar";
import { useStudentCourse } from "@/components/learn/student-course-context";
import { VimeoPlayer, type VimeoProgress } from "@/components/video/vimeo-player";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useCreator } from "@/lib/creator";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";
import {
  readVideoPosition,
  setLessonCompleted,
  touchLesson,
  writeVideoPosition,
} from "@/lib/progress";
import { downloadProtectedFile, formatFileSize } from "@/lib/storage";

export default function LessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { course, enrollment, hasAccess, isEnrolled, isOwner, loading } = useStudentCourse();
  const { data: creator } = useCreator(course?.creatorId);
  const [showOutline, setShowOutline] = useState(false);

  const item = course?.items.find((i) => i.id === lessonId && i.kind === "lesson");
  const canView = Boolean(item && (hasAccess || item.isPreview) && (!item.hidden || isOwner));
  const lessonRef = useMemo(
    () => (canView ? doc(db, "courses", courseId, "lessons", lessonId) : null),
    [canView, courseId, lessonId],
  );
  const { data: lesson, loading: lessonLoading } = useDocData<LessonDoc>(lessonRef);

  const completed = useMemo(() => enrollment?.progress.completedLessonIds ?? [], [enrollment]);
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const isDone = completedSet.has(lessonId);
  const autoCompleted = useRef(false);
  const lastSaved = useRef(0);
  const startAt = useMemo(
    () => (typeof window === "undefined" ? 0 : readVideoPosition(courseId, lessonId)),
    [courseId, lessonId],
  );

  // Dernière leçon ouverte (reprise depuis « Mes formations »).
  useEffect(() => {
    autoCompleted.current = false;
    lastSaved.current = 0;
    if (isEnrolled && user) touchLesson(courseId, user.uid, lessonId).catch(() => undefined);
  }, [isEnrolled, user, courseId, lessonId]);

  if (loading) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-[280px_1fr]">
        <Skeleton className="hidden h-[70vh] lg:block" />
        <Skeleton className="aspect-video w-full" />
      </div>
    );
  }
  if (!course || !item || !canView) {
    const salesPath =
      course && creator && course.status === "published"
        ? routes.salesPage(creator.slug, course.slug)
        : null;
    return <NoAccess salesPath={salesPath} />;
  }

  const total = visibleLessons(course.items).length;
  const done = completedCount(course.items, completed);
  const { prev, next } = adjacentLessons(course.items, lessonId);
  const tracksProgress = isEnrolled && Boolean(user);

  async function toggleDone() {
    if (!user || !tracksProgress) return;
    try {
      await setLessonCompleted(courseId, user.uid, lessonId, !isDone);
      if (!isDone && next) router.push(routes.lesson(courseId, next.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function onProgress(progress: VimeoProgress) {
    if (progress.seconds - lastSaved.current > 5) {
      lastSaved.current = progress.seconds;
      writeVideoPosition(courseId, lessonId, progress.seconds);
    }
    if (
      tracksProgress &&
      user &&
      !isDone &&
      !autoCompleted.current &&
      progress.percent >= AUTO_COMPLETE_RATIO
    ) {
      autoCompleted.current = true;
      setLessonCompleted(courseId, user.uid, lessonId, true)
        .then(() => toast.success("Leçon terminée"))
        .catch(() => (autoCompleted.current = false));
    }
  }

  const outline = (
    <div className="space-y-4">
      <Link
        href={routes.course(courseId)}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Retour à l&apos;aperçu
      </Link>
      <div className="space-y-2">
        <p className="font-semibold leading-snug">{course.title}</p>
        {tracksProgress ? (
          <>
            <ProgressBar percent={total ? Math.round((done / total) * 100) : 0} />
            <p className="text-[12px] text-muted">{progressLabel(done, total)}</p>
          </>
        ) : null}
      </div>
      <CourseOutlineNav
        courseId={courseId}
        items={course.items}
        completedIds={completedSet}
        activeLessonId={lessonId}
        hasAccess={hasAccess}
      />
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[300px_1fr]">
      <aside className="hidden border-r border-line-soft px-4 py-6 lg:block">
        <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-1">{outline}</div>
      </aside>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold">{item.title}</h1>
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            onClick={() => setShowOutline((v) => !v)}
          >
            <ListTree /> Plan
          </Button>
        </div>
        {showOutline ? (
          <div className="mb-6 rounded-card border border-line p-4 lg:hidden">{outline}</div>
        ) : null}

        {isOwner && !isEnrolled ? (
          <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
            Aperçu formateur : la progression n&apos;est pas enregistrée.{" "}
            <Link href={routes.adminLesson(courseId, lessonId)} className="underline">
              Modifier la leçon
            </Link>
          </p>
        ) : null}

        {lessonLoading ? (
          <Skeleton className="aspect-video w-full" />
        ) : lesson?.video ? (
          <VimeoPlayer
            key={lessonId}
            video={lesson.video}
            title={item.title}
            startAt={startAt}
            onProgress={onProgress}
            onPause={(progress) =>
              progress.seconds && writeVideoPosition(courseId, lessonId, progress.seconds)
            }
          />
        ) : lesson?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lesson.thumbnailUrl}
            alt=""
            className="aspect-video w-full rounded-md object-cover"
          />
        ) : null}

        {lesson?.body ? <RichText doc={lesson.body} className="mt-5" /> : null}

        {lesson?.links.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {lesson.links.map((link) => (
              <Button key={link.url} asChild variant="secondary" size="sm">
                <a href={link.url} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink /> {link.label}
                </a>
              </Button>
            ))}
          </div>
        ) : null}

        {lesson?.attachments.length ? (
          <div className="mt-5">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <Paperclip className="size-3.5 text-muted" /> Fichiers
            </p>
            <ul className="divide-y divide-line-soft rounded-md border border-line">
              {lesson.attachments.map((attachment) => (
                <li key={attachment.path} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                  <span className="text-[12px] text-muted">{formatFileSize(attachment.size)}</span>
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() =>
                      downloadProtectedFile(attachment.path, attachment.name).catch((error) =>
                        toast.error(errorMessage(error)),
                      )
                    }
                  >
                    <Download /> Télécharger
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2 border-b border-line-soft pb-6">
          <Button
            asChild
            variant="subtle"
            size="icon"
            aria-label="Leçon précédente"
            className={cn(!prev && "invisible")}
          >
            <Link href={prev ? routes.lesson(courseId, prev.id) : "#"}>
              <ArrowLeft />
            </Link>
          </Button>
          <Button
            asChild
            variant="subtle"
            size="icon"
            aria-label="Leçon suivante"
            className={cn(!next && "invisible")}
          >
            <Link href={next ? routes.lesson(courseId, next.id) : "#"}>
              <ArrowRight />
            </Link>
          </Button>
          {tracksProgress ? (
            <Button variant={isDone ? "secondary" : "primary"} onClick={toggleDone}>
              {isDone ? <Check className="text-success" /> : <Square />}
              {isDone ? "Terminée" : "Terminer"}
            </Button>
          ) : null}
        </div>

        <div className="mt-6">
          <LessonComments
            course={course}
            lessonId={lessonId}
            canRead={hasAccess}
            isOwner={isOwner}
          />
        </div>
      </div>
    </div>
  );
}
