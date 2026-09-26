/**
 * Données de démo pour les émulateurs (reprend la maquette Figma « app forma »).
 *
 *   npm run emulators            # dans un terminal
 *   npm run seed                 # dans un autre
 *
 * Comptes : theo@ecolemotion.com / motion123 (formateur) — anne@exemple.fr / eleve123 (élève)
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { DEFAULT_WELCOME_EMAIL } from "../shared/constants";
import type { OutlineItem, RichText } from "../shared/types";
import { ensureSchoolOwner } from "./school-owner";
import { initAdmin } from "./admin";

const { auth, db } = initAdmin({ emulators: true });

/** Vidéo publique Vimeo utilisée pour la démo. */
const DEMO_VIDEO = {
  provider: "vimeo",
  id: "76979871",
  hash: null,
  title: "Démo",
  durationSec: 62,
  thumbnailUrl: null,
};

function text(content: string, link?: string) {
  return link
    ? { type: "text", text: content, marks: [{ type: "link", attrs: { href: link } }] }
    : { type: "text", text: content };
}

function richText(...paragraphs: unknown[][]): RichText {
  return { type: "doc", content: paragraphs.map((content) => ({ type: "paragraph", content })) };
}

const outline: [string, string[]][] = [
  ["Introduction", ["Introduction à la formation"]],
  [
    "Découverte du logiciel",
    [
      "Découverte de l'interface",
      "Votre première animation",
      "Calques de forme & Masques",
      "Les modificateurs de forme",
      "Exporter ses animations",
    ],
  ],
  [
    "Les bases de l'animation",
    [
      "Les courbes de vitesse",
      "Les boucles",
      "Le Morphing",
      "Animation de texte",
      "Les effets et stylisations",
      "Animer un logo",
      "Les expressions",
    ],
  ],
  ["Animation de personnage", ["Animer un visage", "Animer un personnage"]],
];

async function upsertUser(email: string, password: string, displayName: string, creator = false) {
  const existing = await auth.getUserByEmail(email).catch(() => null);
  const user =
    existing ?? (await auth.createUser({ email, password, displayName, emailVerified: true }));
  if (creator) await auth.setCustomUserClaims(user.uid, { creator: true });
  await db
    .doc(`users/${user.uid}`)
    .set({ email, notifyOnComment: true, createdAt: FieldValue.serverTimestamp() });
  await db
    .doc(`profiles/${user.uid}`)
    .set({ displayName, avatarUrl: null, createdAt: FieldValue.serverTimestamp() });
  return user.uid;
}

const daysAgo = (days: number) => Timestamp.fromMillis(Date.now() - days * 86_400_000);

async function main() {
  const theo = await upsertUser("theo@ecolemotion.com", "motion123", "Théo Robert", true);
  await db.doc(`creators/${theo}`).set({
    name: "Ecole Motion",
    slug: "ecole-motion",
    logoUrl: null,
    brandColor: "#9d72f9",
    supportEmail: "theo@ecolemotion.com",
    createdAt: FieldValue.serverTimestamp(),
  });
  await ensureSchoolOwner(auth, db, theo);
  // Théo administre aussi la plateforme (validation des demandes d'espace formateur).
  const theoUser = await auth.getUser(theo);
  await auth.setCustomUserClaims(theo, { ...(theoUser.customClaims ?? {}), platformAdmin: true });
  await db.doc(`platformAdmins/${theo}`).set({ email: "theo@ecolemotion.com" });

  const courseId = "after-effects";
  const items: OutlineItem[] = [];
  outline.forEach(([chapter, lessons], chapterIndex) => {
    items.push({ id: `ch${chapterIndex + 1}`, kind: "chapter", title: chapter });
    lessons.forEach((title) => {
      items.push({
        id: `l${items.filter((item) => item.kind === "lesson").length + 1}`,
        kind: "lesson",
        title,
        isPreview: items.length === 1,
        durationSec: DEMO_VIDEO.durationSec,
      });
    });
  });
  const lessonIds = items.filter((item) => item.kind === "lesson").map((item) => item.id);

  await db.doc(`courses/${courseId}`).set({
    creatorId: theo,
    title: "Formation complète : Maîtriser After Effects de A à Z",
    slug: "maitriser-after-effects",
    description: richText(
      [
        text(
          "Apprends le motion design sur After Effects, des bases jusqu'à l'animation de personnage.",
        ),
      ],
      [text("15 leçons vidéo, des exercices et un accès au Discord de l'école.")],
    ),
    summary:
      "Apprends le motion design sur After Effects, des bases jusqu'à l'animation de personnage.",
    thumbnailUrl: null,
    status: "published",
    visibility: "visible",
    commentsMode: "active",
    items,
    outlineVersion: 1,
    salesPage: null,
    createdAt: daysAgo(900),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.doc(`courses/${courseId}/private/settings`).set({
    welcomeEmail: DEFAULT_WELCOME_EMAIL,
    externalCtaUrl: null,
  });

  for (const item of items.filter((i) => i.kind === "lesson")) {
    await db.doc(`courses/${courseId}/lessons/${item.id}`).set({
      creatorId: theo,
      courseId,
      courseStatus: "published",
      isPreview: Boolean(item.isPreview),
      title: item.title,
      video: DEMO_VIDEO,
      thumbnailUrl: null,
      body:
        item.id === "l1"
          ? richText(
              [
                text("Coaching individuel : "),
                text("cal.com/theorobert", "https://cal.com/theorobert/coaching-individuel"),
              ],
              [text("Discord : "), text("discord.gg/ecolemotion", "https://discord.gg/4nRn6mDyKU")],
              [
                text(
                  "Contact (privilégiez le Discord pour les besoins non urgents) : theo@ecolemotion.com",
                ),
              ],
            )
          : richText([text(`Dans cette leçon : ${item.title.toLowerCase()}.`)]),
      links:
        item.id === "l1"
          ? [{ label: "Discord de l'école", url: "https://discord.gg/4nRn6mDyKU" }]
          : [],
      attachments: [],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const students: [string, string, number, number][] = [
    ["anne@exemple.fr", "Anne", 8, 3],
    ["laure@exemple.fr", "Laure P", 1, 0],
    ["alexandre@exemple.fr", "Alexandre", 29, 11],
    ["pierre@exemple.fr", "Pierre Levallois", 480, 14],
    ["isabelle@exemple.fr", "Isabelle Sourati", 485, 0],
  ];
  const uids: Record<string, string> = {};
  for (const [email, name, joinedDaysAgo, completed] of students) {
    const uid = await upsertUser(email, "eleve123", name);
    uids[name] = uid;
    await db.doc(`enrollments/${courseId}_${uid}`).set({
      courseId,
      creatorId: theo,
      uid,
      email,
      displayName: name,
      source: "import",
      orderId: null,
      status: "active",
      joinedAt: daysAgo(joinedDaysAgo),
      progress: {
        completedLessonIds: lessonIds.slice(0, completed),
        lastLessonId: completed ? lessonIds[Math.min(completed, lessonIds.length - 1)] : null,
        lastActivityAt: completed ? daysAgo(Math.max(0, joinedDaysAgo - 1)) : null,
      },
    });
  }

  const comments = db.collection(`courses/${courseId}/comments`);
  await comments.doc("demo-1").set({
    courseId,
    creatorId: theo,
    lessonId: "l3",
    authorUid: uids.Alexandre,
    authorName: "Alexandre",
    authorAvatarUrl: null,
    body: "Top ! Merci pour ta pédagogie ! Est-ce que tu sais pourquoi F9 ne fonctionne pas pour moi, je suis sur Mac ?",
    parentId: null,
    createdAt: daysAgo(3),
  });
  await comments.doc("demo-2").set({
    courseId,
    creatorId: theo,
    lessonId: "l3",
    authorUid: theo,
    authorName: "Théo Robert",
    authorAvatarUrl: null,
    body: "Sur Mac, utilise Fn + F9 (ou désactive les touches spéciales dans les réglages clavier). Bon début de formation :)",
    parentId: "demo-1",
    createdAt: daysAgo(2),
  });

  console.log("✔ Données de démo créées.");
  console.log("  Formateur : theo@ecolemotion.com / motion123");
  console.log("  Élève     : anne@exemple.fr / eleve123");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
