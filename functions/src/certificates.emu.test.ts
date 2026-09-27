import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issueCertificate } from "./certificates";
import { db } from "./db";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

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
        { id: "l1", kind: "lesson", title: "Leçon 1", durationSec: 600 },
        { id: "l2", kind: "lesson", title: "Leçon 2", durationSec: 1200 },
      ],
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

describe("certificat de réussite", () => {
  const issue = (uid = "lea", name = "Léa Martin") =>
    issueCertificate({ courseId: "c1", uid, name });

  it("refusé tant que la formation n'est pas terminée, ou sans inscription", async () => {
    await expect(issue()).rejects.toThrow("Termine toutes les leçons");
    await expect(issue("autre")).rejects.toThrow("pas inscrit");
  });

  it("délivré une fois, nom corrigeable", async () => {
    await db()
      .doc("enrollments/c1_lea")
      .update({ "progress.completedLessonIds": ["l1", "l2"] });
    const id = await issue();
    expect((await db().doc(`certificates/${id}`).get()).data()).toMatchObject({
      courseId: "c1",
      courseTitle: "After Effects",
      schoolId: "theo",
      schoolName: "Ecole Motion",
      studentUid: "lea",
      studentName: "Léa Martin",
      lessonCount: 2,
      durationSec: 1800,
    });
    expect((await db().doc("enrollments/c1_lea").get()).data()?.certificateId).toBe(id);
    expect(await issue("lea", "Léa M.")).toBe(id);
    expect((await db().doc(`certificates/${id}`).get()).data()?.studentName).toBe("Léa M.");
  });

  it("formation sans certificat : refusé", async () => {
    await db()
      .doc("enrollments/c1_lea")
      .update({ "progress.completedLessonIds": ["l1", "l2"] });
    await db().doc("courses/c1").update({ certificate: false });
    await expect(issue()).rejects.toThrow("ne délivre pas");
  });
});
