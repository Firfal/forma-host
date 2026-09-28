"use client";

import { doc } from "firebase/firestore";
import {
  ArrowLeft,
  Award,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  ListChecks,
  ListTree,
  Lock,
  Paperclip,
  Square,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { certificateEnabled } from "@shared/certificates";
import { AUTO_COMPLETE_RATIO } from "@shared/constants";
import { adjacentLessons, completedCount, visibleLessons } from "@shared/outline";
import { enrollmentId, routes } from "@shared/paths";
import type { AssistantSettingsDoc } from "@shared/assistant";
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
import { useActivityTracker } from "@/lib/attendance";
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

// Blocs facultatifs de la leçon : téléchargés seulement si la leçon les utilise.
const LessonQuiz = dynamic(() =>
  import("@/components/learn/lesson-quiz").then((m) => m.LessonQuiz),
);
const LessonExercise = dynamic(() =>
  import("@/components/learn/lesson-exercise").then((m) => m.LessonExercise),
);
const LessonAssistant = dynamic(() =>
  import("@/components/learn/lesson-assistant").then((m) => m.LessonAssistant),
);

const longDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const formatLongDate = (date: Date) => longDate.format(date);

export default function LessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { course, enrollment, hasAccess, isEnrolled, isOwner, locks, loading } = useStudentCourse();
  const { data: creator } = useCreator(course?.creatorId);
  const [showOutline, setShowOutline] = useState(false);

  const item = course?.items.find((i) => i.id === lessonId && i.kind === "lesson");
  const canView = Boolean(item && (hasAccess || item.isPreview) && (!item.hidden || isOwner));
  // Ouverture progressive : la leçon n'est pas encore ouverte pour cet élève.
  const lock = locks.get(lessonId);
  const lessonRef = useMemo(
    () => (canView && !lock ? doc(db, "courses", courseId, "lessons", lessonId) : null),
    [canView, lock, courseId, lessonId],
  );
  const { data: lesson, loading: lessonLoading } = useDocData<LessonDoc>(lessonRef);
  // Réglage de la plateforme lu seulement si la formation propose l'assistant.
  const assistantRef = useMemo(
    () => (course?.assistant ? doc(db, "platform", "assistant") : null),
    [course?.assistant],
  );
  const { data: assistantSettings } = useDocData<AssistantSettingsDoc>(assistantRef);
  // Assiduité : temps passé sur les leçons ouvertes (élève inscrit seulement).
  const markActive = useActivityTracker(
    isEnrolled && user && canView && !lock ? enrollmentId(courseId, user.uid) : null,
    lessonId,
  );

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
  // Quiz obligatoire : la leçon se termine en le réussissant (ni bouton, ni fin de vidéo).
  const quizRequired = Boolean(lesson?.quiz?.required);

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
    markActive();
    if (progress.seconds - lastSaved.current > 5) {
      lastSaved.current = progress.seconds;
      writeVideoPosition(courseId, lessonId, progress.seconds);
    }
    if (
      tracksProgress &&
      user &&
      !isDone &&
      !quizRequired &&
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
        locks={locks}
      />
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[300px_1fr]">
      <aside
        aria-label="Plan de la formation"
        className="hidden border-r border-line-soft px-4 py-6 lg:block"
      >
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

        {lock ? (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md border border-line bg-surface px-6 text-center">
            <Lock className="size-6 text-muted" />
            <p className="font-medium">
              {lock.reason === "date"
                ? `Cette leçon s'ouvre le ${formatLongDate(lock.availableAt)}.`
                : "Cette leçon s'ouvre quand la précédente est terminée."}
            </p>
            {lock.reason === "sequential" ? (
              <Button asChild size="sm">
                <Link href={routes.lesson(courseId, lock.previousLessonId)}>
                  <ArrowLeft /> Reprendre « {lock.previousTitle} »
                </Link>
              </Button>
            ) : (
              <p className="text-[13px] text-muted">
                Ta formation s&apos;ouvre au fil des semaines, à ton rythme.
              </p>
            )}
          </div>
        ) : lessonLoading ? (
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

        {lesson?.quiz && !lock ? (
          <LessonQuiz
            key={lessonId}
            courseId={courseId}
            lessonId={lessonId}
            quiz={lesson.quiz}
            result={enrollment?.quizResults?.[lessonId]}
            mode={tracksProgress ? "student" : isOwner ? "preview" : "visitor"}
          />
        ) : null}

        {lesson?.exercise && !lock ? (
          <LessonExercise
            key={`exercise-${lessonId}`}
            courseId={courseId}
            creatorId={course.creatorId}
            lessonId={lessonId}
            lessonTitle={item.title}
            exercise={lesson.exercise}
            mode={tracksProgress ? "student" : isOwner ? "preview" : "visitor"}
          />
        ) : null}

        {tracksProgress && total > 0 && done === total ? (
          <Link
            href={routes.course(courseId)}
            className="mt-6 flex items-center gap-3 rounded-card border border-success/30 bg-success-soft px-4 py-3 text-[14px] text-success hover:bg-success-soft/70"
          >
            <Award className="size-5 shrink-0" />
            <span className="flex-1">
              <span className="font-semibold">Formation terminée, bravo !</span>{" "}
              {certificateEnabled(course)
                ? "Ton certificat t'attend sur la page de la formation."
                : "Retrouve ton parcours sur la page de la formation."}
            </span>
            <ArrowRight className="size-4 shrink-0" />
          </Link>
        ) : null}

        {assistantSettings?.enabled && course.assistant && !lock && (tracksProgress || isOwner) ? (
          <LessonAssistant key={`assistant-${lessonId}`} courseId={courseId} lessonId={lessonId} />
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-b border-line-soft pb-6">
          {prev ? (
            <Button asChild variant="subtle" aria-label="Leçon précédente">
              <Link href={routes.lesson(courseId, prev.id)}>
                <ArrowLeft /> <span className="hidden sm:inline">Précédente</span>
              </Link>
            </Button>
          ) : null}
          <span className="flex-1" />
          {tracksProgress && !lock && quizRequired && !isDone ? (
            <Button asChild>
              <a href="#quiz">
                <ListChecks /> Réussir le quiz pour terminer
              </a>
            </Button>
          ) : tracksProgress && !lock ? (
            <Button variant={isDone ? "secondary" : "primary"} onClick={toggleDone}>
              {isDone ? <Check className="text-success" /> : <Square />}
              {isDone ? "Terminée" : "Terminer"}
            </Button>
          ) : null}
          {next ? (
            <Button
              asChild
              // Leçon terminée (ou visiteur) : passer à la suivante devient l'action principale.
              variant={isDone || !tracksProgress || lock ? "primary" : "secondary"}
              aria-label="Leçon suivante"
            >
              <Link href={routes.lesson(courseId, next.id)}>
                Suivante <ArrowRight />
              </Link>
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
