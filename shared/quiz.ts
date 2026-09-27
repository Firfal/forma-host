import { z } from "zod";

/**
 * Quiz de fin de leçon. Les questions sont sur la leçon (lisibles par les élèves), les bonnes
 * réponses dans courses/{courseId}/quizKeys/{lessonId} (formateurs uniquement) : la correction
 * se fait côté serveur (callable submitQuiz).
 */

export const QUIZ_LIMITS = {
  questions: 30,
  choices: 8,
  question: 500,
  choice: 200,
  explanation: 1000,
} as const;
export const DEFAULT_PASS_PERCENT = 70;

export interface QuizChoice {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  text: string;
  choices: QuizChoice[];
  /** Plusieurs bonnes réponses : cases à cocher (sinon, un seul choix). */
  multiple: boolean;
}

/** lessons/{id}.quiz : sans les bonnes réponses. */
export interface LessonQuiz {
  questions: QuizQuestion[];
  /** Score minimal pour réussir (pourcentage). */
  passPercent: number;
  /** Réussite obligatoire pour terminer la leçon (et obtenir le certificat). */
  required: boolean;
}

/** courses/{courseId}/quizKeys/{lessonId} : lisible et modifiable par les formateurs. */
export interface QuizKeyDoc<T = unknown> {
  creatorId: string;
  courseId: string;
  /** Identifiants des bonnes réponses, par question. */
  answers: Record<string, string[]>;
  /** Explication montrée après la réponse, par question (facultative). */
  explanations: Record<string, string>;
  updatedAt: T;
}

/** enrollments.quizResults[lessonId] : écrit par le serveur uniquement. */
export interface QuizResult<T = unknown> {
  percent: number;
  bestPercent: number;
  passed: boolean;
  attempts: number;
  lastAt: T;
}

/** Réponses de l'élève : identifiants des choix cochés, par question. */
export type QuizAnswers = Record<string, string[]>;

export const submitQuizInput = z.object({
  courseId: z.string().min(1).max(128),
  lessonId: z.string().min(1).max(64),
  answers: z
    .record(z.string().max(64), z.array(z.string().max(64)).max(QUIZ_LIMITS.choices))
    .refine((answers) => Object.keys(answers).length <= QUIZ_LIMITS.questions, "Trop de réponses"),
});
export type SubmitQuizInput = z.infer<typeof submitQuizInput>;

export interface GradedQuestion {
  id: string;
  correct: boolean;
  /** Bonnes réponses : seulement une fois le quiz réussi (sinon, l'élève cherche encore). */
  expected: string[] | null;
  explanation: string | null;
}

export interface QuizGrade {
  correctCount: number;
  total: number;
  percent: number;
  passed: boolean;
  questions: GradedQuestion[];
}

function sameSet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Corrige une tentative. Une question est juste si exactement les bonnes réponses sont cochées. */
export function gradeQuiz(
  quiz: LessonQuiz,
  key: Pick<QuizKeyDoc, "answers" | "explanations">,
  answers: QuizAnswers,
): QuizGrade {
  const results = quiz.questions.map((question) => {
    const expected = key.answers[question.id] ?? [];
    const given = answers[question.id] ?? [];
    return {
      id: question.id,
      correct: expected.length > 0 && sameSet(given, expected),
      expected,
      explanation: key.explanations[question.id]?.trim() || null,
    };
  });
  const total = results.length;
  const correctCount = results.filter((result) => result.correct).length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;
  const passed = total > 0 && percent >= quiz.passPercent;
  return {
    correctCount,
    total,
    percent,
    passed,
    questions: results.map((result) => ({ ...result, expected: passed ? result.expected : null })),
  };
}

/** Résultat cumulé après une tentative : meilleur score gardé, réussite définitive. */
export function nextQuizResult<T>(
  previous: QuizResult<unknown> | undefined,
  grade: Pick<QuizGrade, "percent" | "passed">,
  at: T,
): QuizResult<T> {
  return {
    percent: grade.percent,
    bestPercent: Math.max(previous?.bestPercent ?? 0, grade.percent),
    passed: Boolean(previous?.passed) || grade.passed,
    attempts: (previous?.attempts ?? 0) + 1,
    lastAt: at,
  };
}

// ---------- Édition (formateur) ----------

export interface QuizDraftChoice {
  id: string;
  text: string;
  correct: boolean;
}

export interface QuizDraftQuestion {
  id: string;
  text: string;
  choices: QuizDraftChoice[];
  explanation: string;
}

export interface QuizDraft {
  questions: QuizDraftQuestion[];
  passPercent: number;
  required: boolean;
}

/** Identifiant court, unique dans le quiz. */
export function quizItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newQuizQuestion(): QuizDraftQuestion {
  return {
    id: quizItemId(),
    text: "",
    choices: [
      { id: quizItemId(), text: "", correct: true },
      { id: quizItemId(), text: "", correct: false },
    ],
    explanation: "",
  };
}

export function newQuizDraft(): QuizDraft {
  return { questions: [newQuizQuestion()], passPercent: DEFAULT_PASS_PERCENT, required: false };
}

/** Premier problème bloquant du quiz (message pour le formateur), null si enregistrable. */
export function quizDraftError(draft: QuizDraft): string | null {
  if (draft.questions.length === 0) return "Ajoute au moins une question au quiz.";
  if (draft.questions.length > QUIZ_LIMITS.questions)
    return `${QUIZ_LIMITS.questions} questions maximum par quiz.`;
  if (!Number.isInteger(draft.passPercent) || draft.passPercent < 0 || draft.passPercent > 100)
    return "Le score pour réussir doit être compris entre 0 et 100 %.";
  for (const [index, question] of draft.questions.entries()) {
    const label = `Question ${index + 1}`;
    if (!question.text.trim()) return `${label} : écris la question.`;
    if (question.text.trim().length > QUIZ_LIMITS.question)
      return `${label} : ${QUIZ_LIMITS.question} caractères maximum.`;
    const choices = question.choices.filter((choice) => choice.text.trim());
    if (choices.length < 2) return `${label} : propose au moins deux réponses.`;
    if (choices.length > QUIZ_LIMITS.choices)
      return `${label} : ${QUIZ_LIMITS.choices} réponses maximum.`;
    if (choices.some((choice) => choice.text.trim().length > QUIZ_LIMITS.choice))
      return `${label} : ${QUIZ_LIMITS.choice} caractères maximum par réponse.`;
    if (!choices.some((choice) => choice.correct)) return `${label} : coche la bonne réponse.`;
    if (question.explanation.trim().length > QUIZ_LIMITS.explanation)
      return `${label} : explication de ${QUIZ_LIMITS.explanation} caractères maximum.`;
  }
  return null;
}

/** Sépare le brouillon en questions publiques et corrigé (réponses vides retirées). */
export function splitQuizDraft(draft: QuizDraft): {
  quiz: LessonQuiz;
  key: Pick<QuizKeyDoc, "answers" | "explanations">;
} {
  const answers: Record<string, string[]> = {};
  const explanations: Record<string, string> = {};
  const questions = draft.questions.map((question) => {
    const choices = question.choices.filter((choice) => choice.text.trim());
    const correct = choices.filter((choice) => choice.correct).map((choice) => choice.id);
    answers[question.id] = correct;
    if (question.explanation.trim()) explanations[question.id] = question.explanation.trim();
    return {
      id: question.id,
      text: question.text.trim(),
      choices: choices.map((choice) => ({ id: choice.id, text: choice.text.trim() })),
      multiple: correct.length > 1,
    };
  });
  return {
    quiz: { questions, passPercent: draft.passPercent, required: draft.required },
    key: { answers, explanations },
  };
}

/** Recompose le brouillon à partir des questions et du corrigé (absent : aucune bonne réponse). */
export function mergeQuizDraft(
  quiz: LessonQuiz,
  key: Pick<QuizKeyDoc, "answers" | "explanations"> | null,
): QuizDraft {
  return {
    passPercent: quiz.passPercent,
    required: quiz.required,
    questions: quiz.questions.map((question) => {
      const correct = new Set(key?.answers[question.id] ?? []);
      return {
        id: question.id,
        text: question.text,
        explanation: key?.explanations[question.id] ?? "",
        choices: question.choices.map((choice) => ({ ...choice, correct: correct.has(choice.id) })),
      };
    }),
  };
}

/** Synthèse pour le formateur : élèves ayant tenté, réussi, score moyen (meilleur score). */
export function quizSummary(results: (QuizResult<unknown> | undefined)[]): {
  attempted: number;
  passed: number;
  averagePercent: number;
} {
  const attempted = results.filter((result): result is QuizResult<unknown> => Boolean(result));
  return {
    attempted: attempted.length,
    passed: attempted.filter((result) => result.passed).length,
    averagePercent: attempted.length
      ? Math.round(
          attempted.reduce((sum, result) => sum + result.bestPercent, 0) / attempted.length,
        )
      : 0,
  };
}

/** Leçons dont le quiz obligatoire n'est pas encore réussi (parmi celles demandées). */
export function missingRequiredQuizzes(
  requiredLessonIds: string[],
  results: Record<string, QuizResult<unknown>> | undefined,
): string[] {
  return requiredLessonIds.filter((lessonId) => !results?.[lessonId]?.passed);
}
