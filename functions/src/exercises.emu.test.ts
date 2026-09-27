import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SubmissionDoc } from "@shared/exercises";
import { db } from "./db";
import { handleNewFeedback, handleNewSubmission, handleSubmissionReviewed } from "./exercises";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

const submission: SubmissionDoc = {
  courseId: "c1",
  creatorId: "theo",
  lessonId: "l2",
  lessonTitle: "Animer un logo",
  uid: "lea",
  studentName: "Léa",
  file: {
    path: "submissions/c1/lea/logo.mp4",
    name: "logo.mp4",
    size: 1000,
    contentType: "video/mp4",
  },
  link: null,
  note: "Voici mon animation",
  status: "submitted",
  createdAt: null,
  reviewedAt: null,
  lastFeedbackAt: null,
};

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db()
    .doc("creators/theo")
    .set({ name: "Ecole Motion", adminUids: ["quentin"] });
  await db().doc("submissions/s1").set(submission);
});

const notification = async (uid: string, id: string) =>
  (await db().doc(`users/${uid}/notifications/${id}`).get()).data();

describe("exercices rendus", () => {
  it("nouvel exercice : chaque administrateur de l'école est prévenu", async () => {
    await handleNewSubmission("s1", submission);
    for (const uid of ["theo", "quentin"]) {
      expect(await notification(uid, "submission_s1")).toMatchObject({
        type: "new_submission",
        title: "Léa a rendu l'exercice « Animer un logo »",
        body: "Voici mon animation",
        link: "/admin/exercices/s1",
        read: false,
      });
    }
    expect(await notification("lea", "submission_s1")).toBeUndefined();
  });

  it("retour du formateur : l'élève est prévenu ; réponse de l'élève : l'équipe", async () => {
    await handleNewFeedback("s1", "f1", {
      authorUid: "theo",
      authorName: "Théo",
      atSec: 12,
      body: "Accélère l'entrée du logo",
      createdAt: null,
    });
    expect(await notification("lea", "feedback_f1")).toMatchObject({
      type: "submission_feedback",
      link: "/formations/c1/l2#exercice",
    });
    expect((await db().doc("submissions/s1").get()).data()?.lastFeedbackAt).toBeTruthy();

    await handleNewFeedback("s1", "f2", {
      authorUid: "lea",
      authorName: "Léa",
      atSec: null,
      body: "Merci !",
      createdAt: null,
    });
    expect(await notification("quentin", "feedback_f2")).toMatchObject({
      link: "/admin/exercices/s1",
    });
    expect(await notification("lea", "feedback_f2")).toBeUndefined();
  });

  it("marqué corrigé : l'élève est prévenu une seule fois", async () => {
    const reviewed = { ...submission, status: "reviewed" as const };
    await handleSubmissionReviewed("s1", submission, reviewed);
    expect(await notification("lea", "reviewed_s1")).toMatchObject({
      title: "Ton exercice « Animer un logo » est corrigé",
    });
    await db().doc("users/lea/notifications/reviewed_s1").delete();
    await handleSubmissionReviewed("s1", reviewed, reviewed);
    expect(await notification("lea", "reviewed_s1")).toBeUndefined();
  });
});
