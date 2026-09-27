import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CourseDoc } from "@shared/types";
import { publishAnnouncement } from "./announcements";
import { db } from "./db";

const PROJECT = "demo-forma";
const course = { creatorId: "theo", title: "After Effects", items: [] } as unknown as CourseDoc;

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
  for (const [uid, status] of [
    ["lea", "active"],
    ["paul", "active"],
    ["ancien", "revoked"],
  ]) {
    await db()
      .doc(`enrollments/c1_${uid}`)
      .set({
        courseId: "c1",
        creatorId: "theo",
        uid,
        email: `${uid}@test.fr`,
        status,
      });
  }
});

describe("annonces", () => {
  const input = (sendEmail: boolean) => ({
    courseId: "c1",
    title: "Nouveau module",
    body: "Les expressions sont en ligne.\n\nBon visionnage !",
    sendEmail,
  });

  it("notification aux élèves actifs, sans email par défaut", async () => {
    const { id, recipients } = await publishAnnouncement({
      input: input(false),
      course,
      authorName: "Théo",
      appUrl: "https://app.test",
    });
    expect(recipients).toBe(2);
    expect((await db().doc(`courses/c1/announcements/${id}`).get()).data()).toMatchObject({
      title: "Nouveau module",
      recipients: 2,
      emailed: false,
    });
    const notification = (
      await db().doc(`users/lea/notifications/announcement_${id}`).get()
    ).data();
    expect(notification).toMatchObject({ type: "announcement", link: "/formations/c1" });
    expect((await db().doc(`users/ancien/notifications/announcement_${id}`).get()).exists).toBe(
      false,
    );
    expect((await db().collection("mail").get()).size).toBe(0);
  });

  it("email seulement si le formateur le demande", async () => {
    const { id } = await publishAnnouncement({
      input: input(true),
      course,
      authorName: "Théo",
      appUrl: "https://app.test",
    });
    const mails = (await db().collection("mail").get()).docs.map((doc) => doc.data());
    expect(mails.map((mail) => mail.to).sort()).toEqual(["lea@test.fr", "paul@test.fr"]);
    expect(mails[0].message.subject).toBe("Nouveau module · After Effects");
    expect(mails[0].message.text).toContain("https://app.test/formations/c1");
    expect((await db().doc(`courses/c1/announcements/${id}`).get()).data()?.emailed).toBe(true);
  });
});
