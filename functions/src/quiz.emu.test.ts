import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issueCertificate } from "./certificates";
import { db } from "./db";
import { submitQuiz } from "./quiz";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

const quiz = {
  passPercent: 50,
  required: true,
  questions: [
    {
      id: "q1",
      text: "Q1",
      multiple: false,
      choices: [
        { id: "a", text: "A" },
        { id: "b", text: "B" },
      ],
    },
    {
      id: "q2",
      text: "Q2",
      multiple: true,
      choices: [
        { id: "c", text: "C" },
        { id: "d", text: "D" },
      ],
    },
  ],
};

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db().doc("creators/theo").set({ name: "Ecole Motion", slug: "ecole-motion" });
  await db()
    .doc("courses/c1")
    .set({
      creatorId: "theo",
      title: "After Effects",
      status: "published",
      items: [
        { id: "l1", kind: "lesson", title: "Leçon 1" },
        { id: "l2", kind: "lesson", title: "Quiz final" },
      ],
    });
  await db().doc("courses/c1/lessons/l1").set({ creatorId: "theo", title: "Leçon 1", quiz: null });
  await db().doc("courses/c1/lessons/l2").set({ creatorId: "theo", title: "Quiz final", quiz });
  await db()
    .doc("courses/c1/quizKeys/l2")
    .set({
      creatorId: "theo",
      courseId: "c1",
      answers: { q1: ["a"], q2: ["c", "d"] },
      explanations: { q1: "Parce que." },
    });
  await db()
    .doc("enrollments/c1_lea")
    .set({
      courseId: "c1",
      creatorId: "theo",
      uid: "lea",
      status: "active",
      progress: { completedLessonIds: ["l1"], lastLessonId: "l1", lastActivityAt: null },
    });
});

const submit = (answers: Record<string, string[]>, uid = "lea", lessonId = "l2") =>
  submitQuiz({ courseId: "c1", lessonId, uid, answers });

describe("quiz", () => {
  it("échec : score gardé, leçon non terminée, bonnes réponses cachées", async () => {
    const grade = await submit({ q1: ["b"], q2: ["c"] });
    expect(grade).toMatchObject({ percent: 0, passed: false });
    expect(grade.questions[0]).toMatchObject({ expected: null, explanation: "Parce que." });
    const enrollment = (await db().doc("enrollments/c1_lea").get()).data()!;
    expect(enrollment.quizResults.l2).toMatchObject({
      percent: 0,
      bestPercent: 0,
      passed: false,
      attempts: 1,
    });
    expect(enrollment.progress.completedLessonIds).toEqual(["l1"]);
  });

  it("réussite : leçon terminée, meilleur score conservé, certificat délivrable", async () => {
    await expect(issueCertificate({ courseId: "c1", uid: "lea", name: "Léa" })).rejects.toThrow(
      "Termine toutes les leçons",
    );
    const grade = await submit({ q1: ["a"], q2: ["d", "c"] });
    expect(grade).toMatchObject({ percent: 100, passed: true });
    expect(grade.questions[1]?.expected).toEqual(["c", "d"]);
    await submit({ q1: ["b"], q2: [] });
    const enrollment = (await db().doc("enrollments/c1_lea").get()).data()!;
    expect(enrollment.quizResults.l2).toMatchObject({
      percent: 0,
      bestPercent: 100,
      passed: true,
      attempts: 2,
    });
    expect(enrollment.progress.completedLessonIds).toEqual(["l1", "l2"]);
    await expect(
      issueCertificate({ courseId: "c1", uid: "lea", name: "Léa" }),
    ).resolves.toBeTruthy();
  });

  it("certificat refusé tant que le quiz obligatoire n'est pas réussi", async () => {
    await db()
      .doc("enrollments/c1_lea")
      .update({ "progress.completedLessonIds": ["l1", "l2"] });
    await expect(issueCertificate({ courseId: "c1", uid: "lea", name: "Léa" })).rejects.toThrow(
      "Réussis le quiz « Quiz final »",
    );
  });

  it("refusé sans inscription active ou sans quiz", async () => {
    await expect(submit({}, "inconnu")).rejects.toThrow("pas inscrit");
    await expect(submit({}, "lea", "l1")).rejects.toThrow("pas de quiz");
    await db().doc("courses/c1/quizKeys/l2").delete();
    await expect(submit({})).rejects.toThrow("en cours de modification");
  });
});
