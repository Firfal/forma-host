"use client";

import { collection, doc, query, where } from "firebase/firestore";
import { ClipboardCheck, Link2, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EXERCISE_LIMITS,
  SUBMISSION_MAX_MB,
  submissionFileError,
  submissionLinkSchema,
  type LessonExercise as LessonExerciseSettings,
  type SubmissionDoc,
} from "@shared/exercises";
import type { ProfileDoc, TimestampLike } from "@shared/types";
import { SubmissionViewer } from "@/components/exercises/submission-viewer";
import { ProgressBar } from "@/components/learn/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { createSubmission, deleteSubmission, uploadSubmissionFile } from "@/lib/exercises";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDateTime, toDate } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import { useSchoolStaff } from "@/lib/school";
import { formatFileSize } from "@/lib/storage";

type Submission = SubmissionDoc<TimestampLike> & { id: string };
type Mode = "student" | "preview" | "visitor";

/** Exercice de la leçon : consignes, rendus de l'élève et retours de l'équipe. */
export function LessonExercise({
  courseId,
  creatorId,
  lessonId,
  lessonTitle,
  exercise,
  mode,
}: {
  courseId: string;
  creatorId: string;
  lessonId: string;
  lessonTitle: string;
  exercise: LessonExerciseSettings;
  mode: Mode;
}) {
  const { user } = useAuth();
  const staff = useSchoolStaff(creatorId);
  const submissionsQuery = useMemo(
    () =>
      mode === "student" && user
        ? query(
            collection(db, "submissions"),
            where("uid", "==", user.uid),
            where("courseId", "==", courseId),
            where("lessonId", "==", lessonId),
          )
        : null,
    [mode, user, courseId, lessonId],
  );
  const { data, loading } = useQueryData<SubmissionDoc<TimestampLike>>(submissionsQuery);
  const submissions = [...data].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0),
  ) as Submission[];
  const [showForm, setShowForm] = useState(false);
  const latest = submissions[0];

  return (
    <section
      id="exercice"
      aria-labelledby="exercise-title"
      className="mt-6 scroll-mt-6 rounded-card border border-line bg-white p-4 sm:p-5"
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ClipboardCheck className="size-5 text-muted" />
        <h2 id="exercise-title" className="font-semibold">
          Exercice
        </h2>
        {latest ? (
          <Badge
            tone={
              latest.status === "reviewed" ? "success" : latest.lastFeedbackAt ? "info" : "neutral"
            }
            className="ml-auto"
          >
            {latest.status === "reviewed"
              ? "Corrigé"
              : latest.lastFeedbackAt
                ? "Retour reçu"
                : "En attente de retour"}
          </Badge>
        ) : null}
      </header>
      {exercise.instructions ? (
        <p className="mb-4 whitespace-pre-line text-[14px]">{exercise.instructions}</p>
      ) : null}

      {mode === "preview" ? (
        <p className="rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          Aperçu formateur : tes élèves rendent leur exercice ici, tu le corriges depuis Exercices.
        </p>
      ) : mode === "visitor" ? (
        <p className="text-[13px] text-muted">
          Inscris-toi à la formation pour rendre cet exercice.
        </p>
      ) : loading ? null : (
        <div className="space-y-4">
          {submissions.map((submission, index) => (
            <article key={submission.id} className="space-y-3 rounded-md border border-line p-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">
                  {index === 0 ? "Ton rendu" : "Version précédente"}
                </span>
                <span className="text-muted">· {formatDateTime(submission.createdAt)}</span>
                {submission.status === "submitted" && !submission.lastFeedbackAt ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    className="ml-auto"
                    onClick={() => {
                      if (!window.confirm("Retirer ce rendu ?")) return;
                      deleteSubmission(submission.id, submission).catch((error) =>
                        toast.error(errorMessage(error)),
                      );
                    }}
                  >
                    <Trash2 /> Retirer
                  </Button>
                ) : null}
              </div>
              <SubmissionViewer
                submissionId={submission.id}
                submission={submission}
                staff={staff}
              />
            </article>
          ))}
          {submissions.length === 0 || showForm ? (
            <SubmissionForm
              courseId={courseId}
              creatorId={creatorId}
              lessonId={lessonId}
              lessonTitle={lessonTitle}
              onDone={() => setShowForm(false)}
              onCancel={submissions.length ? () => setShowForm(false) : undefined}
            />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              <Plus /> Rendre une nouvelle version
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function SubmissionForm({
  courseId,
  creatorId,
  lessonId,
  lessonTitle,
  onDone,
  onCancel,
}: {
  courseId: string;
  creatorId: string;
  lessonId: string;
  lessonTitle: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { user } = useAuth();
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);
  const [kind, setKind] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(next: File | undefined) {
    if (!next) return;
    const error = submissionFileError(next);
    if (error) {
      toast.error(error);
      return;
    }
    setFile(next);
  }

  async function submit() {
    if (!user) return;
    let cleanLink: string | null = null;
    if (kind === "link") {
      const parsed = submissionLinkSchema.safeParse(link);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Lien invalide");
        return;
      }
      cleanLink = parsed.data;
    } else if (!file) {
      toast.error("Choisis le fichier de ton exercice.");
      return;
    }
    setProgress(0);
    try {
      const uploaded =
        kind === "file" && file
          ? await uploadSubmissionFile(courseId, user.uid, file, setProgress)
          : null;
      await createSubmission({
        courseId,
        creatorId,
        lessonId,
        lessonTitle: lessonTitle.slice(0, 200),
        uid: user.uid,
        studentName: (
          profile?.displayName ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Élève"
        ).slice(0, 80),
        file: uploaded,
        link: cleanLink,
        note: note.trim(),
      });
      toast.success("Exercice envoyé, ton formateur est prévenu");
      setFile(null);
      setLink("");
      setNote("");
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <form
      className="space-y-3 rounded-md border border-dashed border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="inline-flex rounded-md border border-line p-0.5 text-[13px]" role="tablist">
        {(
          [
            ["file", "Fichier", Paperclip],
            ["link", "Lien", Link2],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            onClick={() => setKind(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium text-muted",
              kind === value && "bg-surface text-ink",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {kind === "file" ? (
        <div
          className="flex flex-wrap items-center gap-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => input.current?.click()}
            disabled={busy}
          >
            <Upload /> {file ? "Changer de fichier" : "Choisir un fichier"}
          </Button>
          <span className="min-w-48 flex-1 break-words text-[13px] text-muted">
            {file
              ? `${file.name} · ${formatFileSize(file.size)}`
              : `Vidéo, image ou PDF, ${SUBMISSION_MAX_MB} Mo maximum.`}
          </span>
          <input
            ref={input}
            type="file"
            accept="video/*,image/png,image/jpeg,image/gif,image/webp,application/pdf"
            className="hidden"
            aria-label="Fichier de l'exercice"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <Input
          type="url"
          aria-label="Lien de l'exercice"
          placeholder="https://… (YouTube, Vimeo, Google Drive, Behance…)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
        />
      )}

      <Textarea
        aria-label="Message pour ton formateur"
        placeholder="Un mot pour ton formateur (facultatif) : ce que tu as essayé, où tu bloques…"
        className="min-h-16"
        maxLength={EXERCISE_LIMITS.note}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
      />

      {busy && kind === "file" ? (
        <div className="flex items-center gap-3">
          <ProgressBar percent={Math.round((progress ?? 0) * 100)} />
          <span className="shrink-0 text-[12px] tabular-nums text-muted">
            {Math.round((progress ?? 0) * 100)} %
          </span>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Envoi…" : "Envoyer mon exercice"}
        </Button>
      </div>
    </form>
  );
}
