"use client";

import { doc } from "firebase/firestore";
import { Check, ListChecks, RotateCcw, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  gradeQuiz,
  type LessonQuiz,
  type QuizAnswers,
  type QuizGrade,
  type QuizKeyDoc,
  type QuizResult,
} from "@shared/quiz";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { callSubmitQuiz, errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

type Mode = "student" | "preview" | "visitor";

/**
 * Quiz de fin de leçon. Élève : correction par le serveur (score gardé, leçon terminée si
 * réussi). Formateur : correction locale, rien n'est enregistré. Visiteur : lecture seule.
 */
export function LessonQuiz({
  courseId,
  lessonId,
  quiz,
  result,
  mode,
}: {
  courseId: string;
  lessonId: string;
  quiz: LessonQuiz;
  result?: QuizResult;
  mode: Mode;
}) {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [grade, setGrade] = useState<QuizGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const keyRef = useMemo(
    () => (mode === "preview" ? doc(db, "courses", courseId, "quizKeys", lessonId) : null),
    [mode, courseId, lessonId],
  );
  const { data: key } = useDocData<QuizKeyDoc>(keyRef);

  const answered = quiz.questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const complete = answered === quiz.questions.length;
  const graded = new Map(grade?.questions.map((q) => [q.id, q]));
  const showSummary = mode === "student" && result?.passed && !retaking && !grade;

  function choose(questionId: string, choiceId: string, multiple: boolean, checked: boolean) {
    setAnswers((current) => {
      const previous = current[questionId] ?? [];
      const next = multiple
        ? checked
          ? [...previous, choiceId]
          : previous.filter((id) => id !== choiceId)
        : [choiceId];
      return { ...current, [questionId]: next };
    });
  }

  async function submit() {
    if (!complete) return;
    if (mode === "preview") {
      if (!key) {
        toast.error("Enregistre le quiz pour le tester.");
        return;
      }
      setGrade(gradeQuiz(quiz, key, answers));
      return;
    }
    setSubmitting(true);
    try {
      const next = await callSubmitQuiz({ courseId, lessonId, answers });
      setGrade(next);
      if (next.passed && !result?.passed) toast.success("Quiz réussi, leçon terminée");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setAnswers({});
    setGrade(null);
    setRetaking(true);
  }

  return (
    <section
      id="quiz"
      aria-labelledby="quiz-title"
      className="mt-6 scroll-mt-6 rounded-card border border-line bg-white p-4 sm:p-5"
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ListChecks className="size-5 text-muted" />
        <h2 id="quiz-title" className="font-semibold">
          Quiz
        </h2>
        <span className="text-[13px] text-muted">
          {quiz.questions.length} question{quiz.questions.length > 1 ? "s" : ""} ·{" "}
          {quiz.passPercent} % pour réussir
        </span>
        {mode === "student" && result ? (
          <Badge tone={result.passed ? "success" : "neutral"} className="ml-auto">
            {result.passed ? "Réussi" : "Meilleur score"} · {result.bestPercent} %
          </Badge>
        ) : null}
      </header>

      {mode === "preview" ? (
        <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info">
          Aperçu formateur : la correction est faite ici, rien n&apos;est enregistré.
        </p>
      ) : null}

      {showSummary ? (
        <div className="flex flex-wrap items-center gap-3">
          <Trophy className="size-5 text-success" />
          <p className="flex-1 text-[14px]">
            Tu as réussi ce quiz avec {result.bestPercent} % de bonnes réponses.
          </p>
          <Button variant="secondary" size="sm" onClick={restart}>
            <RotateCcw /> Refaire le quiz
          </Button>
        </div>
      ) : (
        <>
          <ol className="space-y-5">
            {quiz.questions.map((question, index) => {
              const outcome = graded.get(question.id);
              const selected = answers[question.id] ?? [];
              const expected = new Set(outcome?.expected ?? []);
              return (
                <li key={question.id}>
                  <fieldset disabled={Boolean(grade) || mode === "visitor"}>
                    <legend className="mb-2 flex items-start gap-2 font-medium">
                      <span className="text-muted tabular-nums">{index + 1}.</span>
                      <span className="flex-1 whitespace-pre-line">{question.text}</span>
                      {outcome ? (
                        outcome.correct ? (
                          <span className="flex shrink-0 items-center gap-1 text-[13px] text-success">
                            <Check className="size-4" /> Juste
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-[13px] text-danger">
                            <X className="size-4" /> À revoir
                          </span>
                        )
                      ) : null}
                    </legend>
                    {question.multiple ? (
                      <p className="-mt-1 mb-2 text-[12px] text-muted">
                        Plusieurs réponses possibles.
                      </p>
                    ) : null}
                    <div className="space-y-1.5">
                      {question.choices.map((choice) => {
                        const isSelected = selected.includes(choice.id);
                        const isExpected = expected.has(choice.id);
                        // Réponses révélées (quiz réussi) : bonnes en vert, erreurs en rouge.
                        // Sinon, seule la question est marquée : un choix juste n'est jamais rouge.
                        const revealed = Boolean(outcome?.expected);
                        return (
                          <label
                            key={choice.id}
                            className={cn(
                              "flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2 text-[14px] transition-colors",
                              !grade && "hover:bg-surface",
                              isSelected && !revealed && "border-ink/40 bg-surface",
                              revealed && isExpected && "border-success/50 bg-success-soft",
                              revealed &&
                                isSelected &&
                                !isExpected &&
                                "border-danger/40 bg-danger-soft",
                              (grade || mode === "visitor") && "cursor-default",
                            )}
                          >
                            <input
                              type={question.multiple ? "checkbox" : "radio"}
                              name={`quiz-${question.id}`}
                              className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
                              checked={isSelected}
                              onChange={(e) =>
                                choose(question.id, choice.id, question.multiple, e.target.checked)
                              }
                            />
                            <span className="flex-1">{choice.text}</span>
                          </label>
                        );
                      })}
                    </div>
                    {outcome?.explanation ? (
                      <p className="mt-2 rounded-md bg-surface px-3 py-2 text-[13px] text-muted">
                        {outcome.explanation}
                      </p>
                    ) : null}
                  </fieldset>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line-soft pt-4">
            {grade ? (
              <>
                <p
                  role="status"
                  className={cn(
                    "mr-auto text-[14px] font-medium",
                    grade.passed ? "text-success" : "text-ink",
                  )}
                >
                  {grade.correctCount}/{grade.total} bonnes réponses ({grade.percent} %) ·{" "}
                  {grade.passed
                    ? "Réussi !"
                    : `Pas encore : il faut ${quiz.passPercent} % pour réussir.`}
                </p>
                <Button variant={grade.passed ? "secondary" : "primary"} onClick={restart}>
                  <RotateCcw /> Recommencer
                </Button>
              </>
            ) : mode === "visitor" ? (
              <p className="mr-auto text-[13px] text-muted">
                Inscris-toi à la formation pour répondre au quiz.
              </p>
            ) : (
              <>
                <span className="mr-auto text-[13px] tabular-nums text-muted">
                  {answered}/{quiz.questions.length} répondue{answered > 1 ? "s" : ""}
                </span>
                <Button onClick={submit} disabled={!complete || submitting}>
                  {submitting ? "Correction…" : "Valider mes réponses"}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
