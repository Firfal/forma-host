import { describe, expect, it } from "vitest";
import {
  gradeQuiz,
  mergeQuizDraft,
  missingRequiredQuizzes,
  newQuizDraft,
  nextQuizResult,
  quizDraftError,
  quizSummary,
  splitQuizDraft,
  submitQuizInput,
  type QuizDraft,
} from "./quiz";

const draft: QuizDraft = {
  passPercent: 50,
  required: true,
  questions: [
    {
      id: "q1",
      text: " Quel raccourci pour une image clé ? ",
      explanation: " Alt + clic sur le chronomètre. ",
      choices: [
        { id: "a", text: "Alt + clic", correct: true },
        { id: "b", text: "Ctrl + K", correct: false },
        { id: "vide", text: "  ", correct: false },
      ],
    },
    {
      id: "q2",
      text: "Quelles courbes existent ?",
      explanation: "",
      choices: [
        { id: "c", text: "Linéaire", correct: true },
        { id: "d", text: "Bézier", correct: true },
        { id: "e", text: "Carrée", correct: false },
      ],
    },
  ],
};

describe("quiz : édition", () => {
  it("sépare questions publiques et corrigé, sans les réponses vides", () => {
    const { quiz, key } = splitQuizDraft(draft);
    expect(quiz.questions[0]).toEqual({
      id: "q1",
      text: "Quel raccourci pour une image clé ?",
      multiple: false,
      choices: [
        { id: "a", text: "Alt + clic" },
        { id: "b", text: "Ctrl + K" },
      ],
    });
    expect(quiz.questions[1]?.multiple).toBe(true);
    expect(JSON.stringify(quiz)).not.toContain("correct");
    expect(key).toEqual({
      answers: { q1: ["a"], q2: ["c", "d"] },
      explanations: { q1: "Alt + clic sur le chronomètre." },
    });
    expect(quiz).toMatchObject({ passPercent: 50, required: true });
  });

  it("recompose le brouillon depuis les questions et le corrigé", () => {
    const { quiz, key } = splitQuizDraft(draft);
    const merged = mergeQuizDraft(quiz, key);
    expect(merged.questions[0]?.choices).toEqual([
      { id: "a", text: "Alt + clic", correct: true },
      { id: "b", text: "Ctrl + K", correct: false },
    ]);
    expect(merged.questions[0]?.explanation).toBe("Alt + clic sur le chronomètre.");
    // Corrigé illisible : les questions restent, sans bonne réponse cochée.
    expect(mergeQuizDraft(quiz, null).questions[1]?.choices.every((c) => !c.correct)).toBe(true);
  });

  it("signale le premier problème bloquant", () => {
    expect(quizDraftError(draft)).toBeNull();
    expect(quizDraftError({ ...draft, questions: [] })).toMatch(/au moins une question/);
    expect(quizDraftError(newQuizDraft())).toBe("Question 1 : écris la question.");
    const noAnswer = structuredClone(draft);
    noAnswer.questions[1]!.choices.forEach((choice) => (choice.correct = false));
    expect(quizDraftError(noAnswer)).toBe("Question 2 : coche la bonne réponse.");
    const oneChoice = structuredClone(draft);
    oneChoice.questions[0]!.choices = [{ id: "a", text: "Seule", correct: true }];
    expect(quizDraftError(oneChoice)).toBe("Question 1 : propose au moins deux réponses.");
    expect(quizDraftError({ ...draft, passPercent: 120 })).toMatch(/entre 0 et 100/);
  });
});

describe("quiz : correction", () => {
  const { quiz, key } = splitQuizDraft(draft);

  it("une question est juste si exactement les bonnes réponses sont cochées", () => {
    const grade = gradeQuiz(quiz, key, { q1: ["a"], q2: ["c"] });
    expect(grade).toMatchObject({ correctCount: 1, total: 2, percent: 50, passed: true });
    expect(grade.questions.map((q) => q.correct)).toEqual([true, false]);
  });

  it("révèle les bonnes réponses seulement une fois le quiz réussi", () => {
    const failed = gradeQuiz(quiz, key, { q1: ["b"], q2: ["c", "d", "e"] });
    expect(failed).toMatchObject({ percent: 0, passed: false });
    expect(failed.questions.every((q) => q.expected === null)).toBe(true);
    expect(failed.questions[0]?.explanation).toBe("Alt + clic sur le chronomètre.");
    const passed = gradeQuiz(quiz, key, { q1: ["a"], q2: ["d", "c"] });
    expect(passed).toMatchObject({ percent: 100, passed: true });
    expect(passed.questions[1]?.expected).toEqual(["c", "d"]);
  });

  it("sans réponse attendue, la question n'est jamais juste", () => {
    const grade = gradeQuiz(quiz, { answers: {}, explanations: {} }, { q1: [], q2: [] });
    expect(grade).toMatchObject({ correctCount: 0, passed: false });
  });

  it("garde le meilleur score et la réussite", () => {
    const first = nextQuizResult(undefined, { percent: 80, passed: true }, 1);
    expect(first).toEqual({ percent: 80, bestPercent: 80, passed: true, attempts: 1, lastAt: 1 });
    const second = nextQuizResult(first, { percent: 20, passed: false }, 2);
    expect(second).toEqual({ percent: 20, bestPercent: 80, passed: true, attempts: 2, lastAt: 2 });
  });

  it("synthèse formateur et quiz obligatoires manquants", () => {
    const passed = nextQuizResult(undefined, { percent: 90, passed: true }, 0);
    const failed = nextQuizResult(undefined, { percent: 30, passed: false }, 0);
    expect(quizSummary([passed, failed, undefined])).toEqual({
      attempted: 2,
      passed: 1,
      averagePercent: 60,
    });
    expect(quizSummary([])).toEqual({ attempted: 0, passed: 0, averagePercent: 0 });
    expect(missingRequiredQuizzes(["l1", "l2"], { l1: passed, l2: failed })).toEqual(["l2"]);
    expect(missingRequiredQuizzes(["l1"], undefined)).toEqual(["l1"]);
  });

  it("valide les réponses envoyées", () => {
    expect(submitQuizInput.safeParse({ courseId: "c", lessonId: "l", answers: {} }).success).toBe(
      true,
    );
    const tooMany = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`q${i}`, []]));
    expect(
      submitQuizInput.safeParse({ courseId: "c", lessonId: "l", answers: tooMany }).success,
    ).toBe(false);
  });
});
