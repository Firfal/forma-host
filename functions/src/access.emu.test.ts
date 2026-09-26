import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CourseDoc } from "@shared/types";
import { grantAccessToStudents, resendAccessEmail } from "./access";
import { handleNewComment } from "./comments";
import { auth, db } from "./db";
import { acceptInvite, readInvite } from "./invites";

const PROJECT = "demo-forma";
const APP_URL = "https://app.test";

const course = {
  creatorId: "theo",
  title: "After Effects de A à Z",
  slug: "after-effects",
  items: [{ id: "l1", kind: "lesson", title: "Interface" }],
  status: "published",
} as unknown as CourseDoc;

async function clearEmulators() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

async function mails() {
  const snap = await db().collection("mail").get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as { to: string; message: { html: string; text: string } }),
  }));
}

function tokenFrom(text: string): string {
  const match = text.match(/bienvenue\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error("Pas de lien d'activation");
  return match[1];
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Lancer via npm run test:emu");
  initializeApp({ projectId: PROJECT });
});

afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

beforeEach(async () => {
  await clearEmulators();
  await db().doc("courses/c1").set(course);
  await db().doc("creators/theo").set({
    name: "Ecole Motion",
    slug: "ecole-motion",
    brandColor: "#5a0eb5",
    supportEmail: null,
    logoUrl: null,
  });
  await db().doc("users/theo").set({ email: "theo@test.fr", notifyOnComment: true });
});

describe("grantAccessToStudents", () => {
  it("crée compte, inscription, invitation, mail et notification", async () => {
    const result = await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "anne@test.fr", name: "Anne Martin" }],
      source: "invite",
      sendEmail: true,
      appUrl: APP_URL,
    });
    expect(result).toEqual({ created: 1, reactivated: 0, alreadyEnrolled: 0, errors: [] });

    const user = await auth().getUserByEmail("anne@test.fr");
    const enrollment = (await db().doc(`enrollments/c1_${user.uid}`).get()).data();
    expect(enrollment).toMatchObject({ status: "active", creatorId: "theo", source: "invite" });
    expect((await db().doc(`profiles/${user.uid}`).get()).data()?.displayName).toBe("Anne Martin");
    expect((await db().doc(`users/theo/notifications/student_c1_${user.uid}`).get()).exists).toBe(
      true,
    );

    const [mail] = await mails();
    expect(mail.id).toBe(`welcome_c1_${user.uid}`);
    expect(mail.to).toBe("anne@test.fr");
    expect(mail.message.text).toContain(`${APP_URL}/bienvenue/`);
  });

  it("est idempotent : un second appel n'envoie pas de second mail", async () => {
    const params = {
      courseId: "c1",
      course,
      students: [{ email: "anne@test.fr" }, { email: "anne@test.fr" }],
      source: "invite" as const,
      sendEmail: true,
      appUrl: APP_URL,
    };
    await grantAccessToStudents(params);
    const second = await grantAccessToStudents(params);
    expect(second.alreadyEnrolled).toBe(1);
    expect(await mails()).toHaveLength(1);
  });

  it("import Podia : conserve la date, sans email", async () => {
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "pierre@test.fr", joinedAt: "2024-02-19T10:00:00Z" }],
      source: "import",
      sendEmail: false,
      appUrl: APP_URL,
    });
    const user = await auth().getUserByEmail("pierre@test.fr");
    const enrollment = (await db().doc(`enrollments/c1_${user.uid}`).get()).data();
    expect((enrollment?.joinedAt as Timestamp).toDate().toISOString()).toBe(
      "2024-02-19T10:00:00.000Z",
    );
    expect(await mails()).toHaveLength(0);
  });

  it("réactive une inscription révoquée", async () => {
    const params = {
      courseId: "c1",
      course,
      students: [{ email: "anne@test.fr" }],
      source: "invite" as const,
      sendEmail: false,
      appUrl: APP_URL,
    };
    await grantAccessToStudents(params);
    const user = await auth().getUserByEmail("anne@test.fr");
    await db().doc(`enrollments/c1_${user.uid}`).update({ status: "revoked" });
    const result = await grantAccessToStudents(params);
    expect(result.reactivated).toBe(1);
    expect((await db().doc(`enrollments/c1_${user.uid}`).get()).data()?.status).toBe("active");
  });

  it("compte existant et activé : lien direct vers la formation", async () => {
    await auth().createUser({ email: "marc@test.fr", password: "secret123" });
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "marc@test.fr" }],
      source: "invite",
      sendEmail: true,
      appUrl: APP_URL,
    });
    const [mail] = await mails();
    expect(mail.message.text).toContain(`${APP_URL}/formations/c1`);
    expect(mail.message.text).not.toContain("bienvenue");
  });
});

describe("invitations", () => {
  it("active le compte avec le jeton, une seule fois", async () => {
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "anne@test.fr" }],
      source: "invite",
      sendEmail: true,
      appUrl: APP_URL,
    });
    const token = tokenFrom((await mails())[0].message.text);
    expect(await readInvite(token)).toEqual({
      email: "anne@test.fr",
      courseTitle: "After Effects de A à Z",
      creatorName: "Ecole Motion",
    });

    await acceptInvite({ token, password: "motdepasse123", displayName: "Anne" });
    const user = await auth().getUserByEmail("anne@test.fr");
    expect(user.emailVerified).toBe(true);
    expect(user.providerData.map((p) => p.providerId)).toContain("password");
    await expect(
      acceptInvite({ token, password: "autre12345", displayName: "Anne" }),
    ).rejects.toThrow(/déjà servi/);
  });

  it("refuse un jeton expiré", async () => {
    await db()
      .doc("invites/tok_expired_0123456789")
      .set({
        uid: "x",
        email: "x@test.fr",
        courseId: "c1",
        creatorId: "theo",
        expiresAt: Timestamp.fromMillis(Date.now() - 1000),
        usedAt: null,
        createdAt: Timestamp.now(),
      });
    await expect(readInvite("tok_expired_0123456789")).rejects.toThrow(/expirée/);
  });

  it("renvoie un lien d'activation tant que le compte n'est pas activé", async () => {
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "anne@test.fr" }],
      source: "import",
      sendEmail: false,
      appUrl: APP_URL,
    });
    const user = await auth().getUserByEmail("anne@test.fr");
    await resendAccessEmail({ courseId: "c1", course, uid: user.uid, appUrl: APP_URL });
    const [mail] = await mails();
    expect(mail.message.text).toContain("/bienvenue/");
  });
});

describe("équipe de l'école", () => {
  it("notifie chaque administrateur : nouvel élève et commentaire d'élève", async () => {
    await db()
      .doc("creators/theo")
      .update({ adminUids: ["theo", "quentin"] });
    await db().doc("users/quentin").set({ email: "quentin@test.fr", notifyOnComment: false });
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "lea@test.fr" }],
      source: "invite",
      sendEmail: false,
      appUrl: APP_URL,
    });
    const lea = await auth().getUserByEmail("lea@test.fr");
    for (const admin of ["theo", "quentin"]) {
      expect(
        (await db().doc(`users/${admin}/notifications/student_c1_${lea.uid}`).get()).exists,
      ).toBe(true);
    }

    // Réponse d'un co-administrateur : pas de notification « nouveau commentaire ».
    await handleNewComment(
      "c1",
      "by-admin",
      {
        courseId: "c1",
        creatorId: "theo",
        lessonId: "l1",
        authorUid: "quentin",
        authorName: "Quentin",
        authorAvatarUrl: null,
        body: "Bonne question !",
        parentId: null,
        createdAt: Timestamp.now(),
      },
      APP_URL,
    );
    expect((await db().doc("users/theo/notifications/comment_by-admin").get()).exists).toBe(false);
  });
});

describe("handleNewComment", () => {
  it("notifie le formateur, l'auteur du parent, et envoie l'email", async () => {
    await db()
      .doc("courses/c1/comments/root")
      .set({ authorUid: "anne", lessonId: "l1", parentId: null });
    await handleNewComment(
      "c1",
      "reply1",
      {
        courseId: "c1",
        creatorId: "theo",
        lessonId: "l1",
        authorUid: "marc",
        authorName: "Marc",
        authorAvatarUrl: null,
        body: "Moi aussi !",
        parentId: "root",
        createdAt: Timestamp.now(),
      },
      APP_URL,
    );
    const creatorNotif = (await db().doc("users/theo/notifications/comment_reply1").get()).data();
    expect(creatorNotif).toMatchObject({
      type: "new_comment",
      link: "/formations/c1/l1#comment-reply1",
    });
    expect((await db().doc("users/anne/notifications/reply_reply1").get()).exists).toBe(true);
    expect((await db().doc("mail/comment_reply1_theo").get()).data()?.to).toBe("theo@test.fr");
  });

  it("ne notifie pas le formateur de ses propres commentaires", async () => {
    await handleNewComment(
      "c1",
      "own",
      {
        courseId: "c1",
        creatorId: "theo",
        lessonId: "l1",
        authorUid: "theo",
        authorName: "Théo",
        authorAvatarUrl: null,
        body: "Bienvenue !",
        parentId: null,
        createdAt: Timestamp.now(),
      },
      APP_URL,
    );
    expect((await db().doc("users/theo/notifications/comment_own").get()).exists).toBe(false);
  });
});

describe("notifications d'inscription", () => {
  it("pas de notification pour un import", async () => {
    await grantAccessToStudents({
      courseId: "c1",
      course,
      students: [{ email: "import@test.fr" }],
      source: "import",
      sendEmail: false,
      appUrl: APP_URL,
    });
    const notifications = await db().collection("users/theo/notifications").get();
    expect(notifications.size).toBe(0);
  });
});
