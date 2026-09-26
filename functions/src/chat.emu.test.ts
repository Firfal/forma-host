import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ConversationDoc, MessageDoc } from "@shared/chat";
import { handleNewMessage, openConversation, updateConversation } from "./chat";
import { db } from "./db";
import type { Caller } from "./guards";
import { isNewNotification } from "./push";

const PROJECT = "demo-forma";
const APP = "https://app.test";
const theo: Caller = { uid: "theo", email: "theo@test.fr", schools: ["theo"] };
const coadmin: Caller = { uid: "quentin", email: "q@test.fr", schools: ["theo"] };
const anne: Caller = { uid: "anne", email: "anne@test.fr", schools: [] };
const bob: Caller = { uid: "bob", email: "bob@test.fr", schools: [] };

const conversation = async (id: string) =>
  (await db().doc(`conversations/${id}`).get()).data() as ConversationDoc<Timestamp>;
const notification = async (uid: string, id: string) =>
  (await db().doc(`users/${uid}/notifications/${id}`).get()).data();

function message(authorUid: string, body: string, authorName = "Anne"): MessageDoc {
  return { authorUid, authorName, body, createdAt: Timestamp.now() };
}

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
  await db()
    .doc("creators/theo")
    .set({ name: "Ecole Motion", slug: "ecole-motion", adminUids: ["quentin"] });
  await db().doc("profiles/anne").set({ displayName: "Anne Martin", avatarUrl: null });
  await db().doc("users/anne").set({ email: "anne@test.fr", notifyOnComment: true });
  const joinedAt = Timestamp.fromDate(new Date("2025-05-01"));
  await db().doc("enrollments/c1_anne").set({
    courseId: "c1",
    creatorId: "theo",
    uid: "anne",
    email: "anne@test.fr",
    displayName: "Anne",
    status: "active",
    joinedAt,
  });
  await db().doc("enrollments/c1_bob").set({
    courseId: "c1",
    creatorId: "theo",
    uid: "bob",
    email: "bob@test.fr",
    displayName: null,
    status: "revoked",
    joinedAt,
  });
});

describe("ouverture d'une conversation", () => {
  it("un élève inscrit écrit à l'école ; l'appel est idempotent", async () => {
    const { conversationId } = await openConversation(anne, { schoolId: "theo" });
    expect(conversationId).toBe("theo_anne");
    expect(await conversation(conversationId)).toMatchObject({
      schoolId: "theo",
      schoolName: "Ecole Motion",
      studentUid: "anne",
      studentName: "Anne Martin",
      studentEmail: "anne@test.fr",
      unreadForSchool: 0,
      archived: false,
      blocked: false,
      mutedBy: [],
    });
    expect((await conversation(conversationId)).studentSince?.toDate()).toEqual(
      new Date("2025-05-01"),
    );
    expect(await openConversation(anne, { schoolId: "theo" })).toEqual({ conversationId });
  });

  it("refuse un élève sans accès actif, ou une école où l'on est membre de l'équipe", async () => {
    await expect(openConversation(bob, { schoolId: "theo" })).rejects.toThrow("aucune formation");
    await expect(openConversation(anne, { schoolId: "autre" })).rejects.toThrow("aucune formation");
    await expect(openConversation(theo, { schoolId: "theo" })).rejects.toThrow("équipe");
    await expect(openConversation(anne, { schoolId: "theo", studentUid: "bob" })).rejects.toThrow(
      "Seule l'équipe",
    );
  });

  it("l'équipe écrit à un élève, même dont l'accès a été retiré", async () => {
    const { conversationId } = await openConversation(coadmin, {
      schoolId: "theo",
      studentUid: "bob",
    });
    expect(await conversation(conversationId)).toMatchObject({
      studentUid: "bob",
      studentName: "bob@test.fr",
    });
    await expect(
      openConversation(theo, { schoolId: "theo", studentUid: "inconnu" }),
    ).rejects.toThrow("inscrite à aucune formation");
  });
});

describe("messages", () => {
  it("message d'élève : compteur école, désarchivage, notification à toute l'équipe", async () => {
    const { conversationId } = await openConversation(anne, { schoolId: "theo" });
    await updateConversation(theo, { conversationId, archived: true });

    await handleNewMessage(conversationId, "m1", message("anne", "Bonjour Théo,\n ça va ?"), APP);
    expect(await conversation(conversationId)).toMatchObject({
      lastMessage: { body: "Bonjour Théo, ça va ?", authorUid: "anne" },
      lastMessageId: "m1",
      unreadForSchool: 1,
      unreadForStudent: 0,
      archived: false,
    });
    for (const uid of ["theo", "quentin"]) {
      expect(await notification(uid, `message_${conversationId}`)).toMatchObject({
        type: "new_message",
        title: "Message de Anne Martin",
        body: "Bonjour Théo, ça va ?",
        link: "/admin/messages/theo_anne",
        read: false,
      });
    }

    // Déclencheur rejoué : rien ne change.
    await handleNewMessage(conversationId, "m1", message("anne", "Bonjour Théo, ça va ?"), APP);
    expect((await conversation(conversationId)).unreadForSchool).toBe(1);
  });

  it("réponse de l'équipe : notification et un seul email tant que l'élève n'a pas lu", async () => {
    const { conversationId } = await openConversation(anne, { schoolId: "theo" });
    await handleNewMessage(conversationId, "r1", message("quentin", "Salut !", "Quentin"), APP);
    await handleNewMessage(conversationId, "r2", message("theo", "Tu as vu ?", "Théo"), APP);

    expect(await conversation(conversationId)).toMatchObject({
      unreadForStudent: 2,
      unreadForSchool: 0,
    });
    expect(await notification("anne", `message_${conversationId}`)).toMatchObject({
      title: "Message de Ecole Motion",
      body: "Théo : Tu as vu ?",
      link: "/messages/theo_anne",
    });
    expect(await notification("theo", `message_${conversationId}`)).toBeUndefined();
    const mails = (await db().collection("mail").get()).docs.map((doc) => doc.data());
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "anne@test.fr", creatorId: "theo" });
    expect(mails[0].message.subject).toBe("Nouveau message de Ecole Motion");
    expect(mails[0].message.text).toContain("Bonjour Anne");
    expect(mails[0].message.text).toContain("https://app.test/messages/theo_anne");
  });

  it("sourdine : plus de notification pour qui l'a activée", async () => {
    const { conversationId } = await openConversation(anne, { schoolId: "theo" });
    await updateConversation(coadmin, { conversationId, muted: true });
    await handleNewMessage(conversationId, "m1", message("anne", "Hello"), APP);
    expect(await notification("theo", `message_${conversationId}`)).toBeDefined();
    expect(await notification("quentin", `message_${conversationId}`)).toBeUndefined();

    await updateConversation(coadmin, { conversationId, muted: false });
    expect((await conversation(conversationId)).mutedBy).toEqual([]);
  });

  it("archivage et blocage réservés à l'équipe", async () => {
    const { conversationId } = await openConversation(anne, { schoolId: "theo" });
    await expect(updateConversation(anne, { conversationId, blocked: true })).rejects.toThrow(
      "Réservé",
    );
    await expect(updateConversation(bob, { conversationId, muted: true })).rejects.toThrow(
      "introuvable",
    );
    await updateConversation(theo, { conversationId, blocked: true });
    expect((await conversation(conversationId)).blocked).toBe(true);
  });
});

describe("push d'une notification réémise", () => {
  it("création ou nouvelle date : oui ; simple lecture : non", () => {
    const t1 = Timestamp.fromMillis(1000);
    const t2 = Timestamp.fromMillis(2000);
    expect(isNewNotification(undefined, { createdAt: t1, read: false })).toBe(true);
    expect(isNewNotification({ createdAt: t1 }, { createdAt: t2, read: false })).toBe(true);
    expect(isNewNotification({ createdAt: t1 }, { createdAt: t1, read: true })).toBe(false);
    expect(isNewNotification({ createdAt: t1 }, { createdAt: t1, read: false })).toBe(false);
  });
});
