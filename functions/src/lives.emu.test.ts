import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { handleNewLive } from "./lives";

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
  await db().doc("courses/c1").set({ creatorId: "theo", title: "After Effects" });
  await db().doc("enrollments/c1_lea").set({ courseId: "c1", uid: "lea", status: "active" });
  await db().doc("enrollments/c1_max").set({ courseId: "c1", uid: "max", status: "revoked" });
});

describe("directs", () => {
  it("direct programmé : les élèves actifs sont prévenus (in-app)", async () => {
    const count = await handleNewLive("c1", "d1", {
      creatorId: "theo",
      courseId: "c1",
      title: "Questions-réponses",
      description: "",
      startsAt: Timestamp.fromDate(new Date("2026-10-01T17:00:00Z")),
      durationMin: 60,
      joinUrl: "https://meet.google.com/abc",
      replayUrl: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    expect(count).toBe(1);
    expect((await db().doc("users/lea/notifications/live_d1").get()).data()).toMatchObject({
      type: "live_scheduled",
      title: "Direct : Questions-réponses",
      body: "After Effects · jeudi 1 octobre à 19:00",
      link: "/formations/c1#directs",
    });
    expect((await db().doc("users/max/notifications/live_d1").get()).exists).toBe(false);
  });
});
