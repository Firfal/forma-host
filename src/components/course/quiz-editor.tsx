"use client";

import { collection, query, where } from "firebase/firestore";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import {
  QUIZ_LIMITS,
  newQuizQuestion,
  quizItemId,
  quizSummary,
  type QuizDraft,
  type QuizDraftQuestion,
} from "@shared/quiz";
import type { EnrollmentDoc } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase/client";
import { useQueryData } from "@/lib/hooks";

/** Éditeur de quiz d'une leçon : questions à choix, bonne(s) réponse(s) cochée(s). */
export function QuizEditor({
  value,
  onChange,
  onRemove,
}: {
  value: QuizDraft;
  onChange: (next: QuizDraft) => void;
  onRemove: () => void;
}) {
  const setQuestion = (index: number, patch: Partial<QuizDraftQuestion>) =>
    onChange({
      ...value,
      questions: value.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    });
  const move = (index: number, delta: number) => {
    const questions = [...value.questions];
    const [question] = questions.splice(index, 1);
    questions.splice(index + delta, 0, question!);
    onChange({ ...value, questions });
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {value.questions.map((question, index) => (
          <li key={question.id} className="space-y-3 rounded-md border border-line p-3">
            <div className="flex items-center gap-1">
              <span className="flex-1 text-[13px] font-semibold">Question {index + 1}</span>
              <Button
                variant="subtle"
                size="icon"
                aria-label="Monter la question"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="subtle"
                size="icon"
                aria-label="Descendre la question"
                disabled={index === value.questions.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="subtle"
                size="icon"
                aria-label={`Supprimer la question ${index + 1}`}
                onClick={() =>
                  onChange({ ...value, questions: value.questions.filter((_, i) => i !== index) })
                }
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              aria-label={`Intitulé de la question ${index + 1}`}
              placeholder="Ex. Quel raccourci crée une image clé ?"
              className="min-h-16"
              maxLength={QUIZ_LIMITS.question}
              value={question.text}
              onChange={(e) => setQuestion(index, { text: e.target.value })}
            />
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-[12px] text-muted">
                Coche la ou les bonnes réponses.
              </legend>
              {question.choices.map((choice, choiceIndex) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-[var(--color-success)]"
                    aria-label={`Réponse ${choiceIndex + 1} correcte`}
                    checked={choice.correct}
                    onChange={(e) =>
                      setQuestion(index, {
                        choices: question.choices.map((c) =>
                          c.id === choice.id ? { ...c, correct: e.target.checked } : c,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Réponse ${choiceIndex + 1}`}
                    placeholder={`Réponse ${choiceIndex + 1}`}
                    maxLength={QUIZ_LIMITS.choice}
                    value={choice.text}
                    onChange={(e) =>
                      setQuestion(index, {
                        choices: question.choices.map((c) =>
                          c.id === choice.id ? { ...c, text: e.target.value } : c,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="subtle"
                    size="icon"
                    aria-label={`Retirer la réponse ${choiceIndex + 1}`}
                    disabled={question.choices.length <= 2}
                    onClick={() =>
                      setQuestion(index, {
                        choices: question.choices.filter((c) => c.id !== choice.id),
                      })
                    }
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </fieldset>
            <Button
              variant="ghost"
              size="sm"
              disabled={question.choices.length >= QUIZ_LIMITS.choices}
              onClick={() =>
                setQuestion(index, {
                  choices: [...question.choices, { id: quizItemId(), text: "", correct: false }],
                })
              }
            >
              <Plus /> Ajouter une réponse
            </Button>
            <Input
              aria-label={`Explication de la question ${index + 1}`}
              placeholder="Explication affichée après la réponse (facultatif)"
              maxLength={QUIZ_LIMITS.explanation}
              value={question.explanation}
              onChange={(e) => setQuestion(index, { explanation: e.target.value })}
            />
          </li>
        ))}
      </ol>

      <Button
        variant="secondary"
        size="sm"
        disabled={value.questions.length >= QUIZ_LIMITS.questions}
        onClick={() => onChange({ ...value, questions: [...value.questions, newQuizQuestion()] })}
      >
        <Plus /> Ajouter une question
      </Button>

      <div className="space-y-3 border-t border-line-soft pt-4">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block font-medium">Score pour réussir</span>
            <span className="block text-[13px] text-muted">
              Part de bonnes réponses nécessaire.
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={5}
              aria-label="Score pour réussir, en pourcentage"
              className="w-20 text-right tabular-nums"
              value={Number.isFinite(value.passPercent) ? value.passPercent : ""}
              onChange={(e) =>
                onChange({ ...value, passPercent: Math.round(Number(e.target.value)) })
              }
            />
            <span className="text-[13px] text-muted">%</span>
          </span>
        </label>
        <label className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-medium">Réussite obligatoire</span>
            <span className="block text-[13px] text-muted">
              La leçon n&apos;est terminée qu&apos;une fois le quiz réussi (nécessaire pour le
              certificat).
            </span>
          </span>
          <Switch
            checked={value.required}
            onCheckedChange={(required) => onChange({ ...value, required })}
          />
        </label>
        <Button variant="ghost" size="sm" className="text-danger" onClick={onRemove}>
          <Trash2 /> Supprimer le quiz
        </Button>
      </div>
    </div>
  );
}

/** Résultats du quiz pour le formateur (meilleur score de chaque élève). */
export function QuizResultsSummary({
  courseId,
  creatorId,
  lessonId,
}: {
  courseId: string;
  creatorId: string;
  lessonId: string;
}) {
  const enrollmentsQuery = useMemo(
    () =>
      query(
        collection(db, "enrollments"),
        where("creatorId", "==", creatorId),
        where("courseId", "==", courseId),
      ),
    [courseId, creatorId],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  if (loading) return null;
  const summary = quizSummary(
    enrollments
      .filter((enrollment) => enrollment.status === "active")
      .map((enrollment) => enrollment.quizResults?.[lessonId]),
  );
  if (!summary.attempted) {
    return <p className="text-[13px] text-muted">Aucun élève n&apos;a encore répondu.</p>;
  }
  return (
    <dl className="grid grid-cols-3 gap-2 text-center">
      {[
        ["Ont répondu", String(summary.attempted)],
        ["Ont réussi", String(summary.passed)],
        ["Score moyen", `${summary.averagePercent} %`],
      ].map(([label, value]) => (
        <div key={label} className="rounded-md bg-surface px-2 py-2">
          <dt className="text-[12px] text-muted">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
