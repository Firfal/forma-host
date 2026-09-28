import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CommunityPostDoc } from "@shared/community";
import {
  handleEnrollmentWritten,
  handleNewPost,
  handleNewReply,
  handlePostDeleted,
  handleReplyDeleted,
  setCommunityEnabled,
} from "./community";
import { db } from "./db";

const PROJECT = "demo-forma";

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  if (!getApps().length) initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

const enrollment = (uid: string, courseId: string, status = "active") => ({
  courseId,
  creatorId: "theo",
  uid,
  status,
});

beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db()
    .doc("creators/theo")
    .set({ name: "Ecole Motion", adminUids: ["quentin"] });
  await db().doc("enrollments/c1_lea").set(enrollment("lea", "c1"));
  await db().doc("enrollments/c2_lea").set(enrollment("lea", "c2"));
  await db()
    .doc("enrollments/c1_max")
    .set(enrollment("max", "c1", "revoked"));
});

const person = async (uid: string) =>
  (await db().doc(`communities/theo/people/${uid}`).get()).exists;

describe("communauté d'école", () => {
  it("ouverture : les élèves actifs deviennent membres", async () => {
    await setCommunityEnabled("theo", true);
    expect((await db().doc("communities/theo").get()).data()).toMatchObject({ enabled: true });
    expect(await person("lea")).toBe(true);
    expect(await person("max")).toBe(false);
  });

  it("l'adhésion suit les inscriptions (tant qu'une reste active)", async () => {
    await setCommunityEnabled("theo", true);
    await db().doc("enrollments/c1_max").update({ status: "active" });
    await handleEnrollmentWritten(
      enrollment("max", "c1", "revoked") as never,
      enrollment("max", "c1") as never,
    );
    expect(await person("max")).toBe(true);
    await db().doc("enrollments/c1_lea").update({ status: "revoked" });
    await handleEnrollmentWritten(
      enrollment("lea", "c1") as never,
      enrollment("lea", "c1", "revoked") as never,
    );
    expect(await person("lea")).toBe(true);
    await db().doc("enrollments/c2_lea").delete();
    await handleEnrollmentWritten(enrollment("lea", "c2") as never, undefined);
    expect(await person("lea")).toBe(false);
  });

  it("sans communauté, rien n'est créé", async () => {
    await handleEnrollmentWritten(undefined, enrollment("lea", "c1") as never);
    expect(await person("lea")).toBe(false);
  });

  it("réponses : compteur, notification de l'auteur ; message supprimé avec ses réponses", async () => {
    const post: CommunityPostDoc = {
      authorUid: "lea",
      authorName: "Léa",
      authorAvatarUrl: null,
      body: "Mon premier projet !",
      pinned: false,
      replyCount: 0,
      lastReplyAt: null,
      createdAt: null,
    };
    await db().doc("communities/theo/posts/p1").set(post);
    await handleNewPost("theo", "p1", post);
    expect((await db().doc("users/quentin/notifications/community_p1").get()).data()).toMatchObject(
      {
        type: "community_post",
        link: "/admin/communaute#post-p1",
      },
    );

    const reply = {
      authorUid: "theo",
      authorName: "Théo",
      authorAvatarUrl: null,
      body: "Bravo",
      createdAt: null,
    };
    await db().doc("communities/theo/posts/p1/replies/r1").set(reply);
    await handleNewReply("theo", "p1", "r1", reply);
    expect((await db().doc("communities/theo/posts/p1").get()).data()?.replyCount).toBe(1);
    expect(
      (await db().doc("users/lea/notifications/community_reply_r1").get()).data(),
    ).toMatchObject({
      type: "community_reply",
      link: "/communaute/theo#post-p1",
    });
    await handleReplyDeleted("theo", "p1");
    expect((await db().doc("communities/theo/posts/p1").get()).data()?.replyCount).toBe(0);

    await db().doc("communities/theo/posts/p1").delete();
    await handlePostDeleted("theo", "p1");
    expect((await db().collection("communities/theo/posts/p1/replies").get()).empty).toBe(true);
  });
});
