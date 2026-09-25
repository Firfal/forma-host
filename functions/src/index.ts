import "./setup";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  acceptInviteInput,
  courseIdInput,
  courseStudentInput,
  grantAccessInput,
  inviteTokenInput,
  resolveVimeoInput,
} from "@shared/schemas";
import { enrollmentId } from "@shared/paths";
import type { CommentDoc, CoursePrivateSettings } from "@shared/types";
import { grantAccessToStudents, resendAccessEmail } from "./access";
import { auth, db } from "./db";
import { parseInput, requireCourseOwner, requireCreator } from "./guards";
import { acceptInvite as acceptInviteImpl, readInvite } from "./invites";
import { brandFromCreator, buildWelcomeEmail } from "./mail";
import { APP_URL, VIMEO_ACCESS_TOKEN } from "./params";
import { handleNewComment } from "./comments";
import { resolveVimeo } from "./vimeo";

/** Donne l'accès à une formation (invitation unitaire ou import CSV). */
export const grantAccess = onCall({ timeoutSeconds: 300 }, async (request) => {
  const caller = requireCreator(request);
  const input = parseInput(grantAccessInput, request.data);
  const course = await requireCourseOwner(input.courseId, caller.uid);
  return grantAccessToStudents({
    courseId: input.courseId,
    course,
    students: input.students,
    source: input.source,
    sendEmail: input.sendEmail,
    appUrl: APP_URL.value(),
  });
});

/** Retire l'accès (l'inscription est conservée, statut « revoked »). */
export const revokeAccess = onCall(async (request) => {
  const caller = requireCreator(request);
  const input = parseInput(courseStudentInput, request.data);
  await requireCourseOwner(input.courseId, caller.uid);
  const ref = db().doc(`enrollments/${enrollmentId(input.courseId, input.uid)}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Inscription introuvable");
  await ref.update({ status: "revoked" });
  return { ok: true };
});

/** Renvoie le mail d'accès (nouveau lien d'activation si le compte n'est pas activé). */
export const resendInvite = onCall(async (request) => {
  const caller = requireCreator(request);
  const input = parseInput(courseStudentInput, request.data);
  const course = await requireCourseOwner(input.courseId, caller.uid);
  try {
    await resendAccessEmail({
      courseId: input.courseId,
      course,
      uid: input.uid,
      appUrl: APP_URL.value(),
    });
  } catch (error) {
    throw new HttpsError("failed-precondition", (error as Error).message);
  }
  return { ok: true };
});

/** Envoie le mail de bienvenue de la formation au formateur, pour tester le modèle. */
export const sendTestWelcomeEmail = onCall(async (request) => {
  const caller = requireCreator(request);
  const input = parseInput(courseIdInput, request.data);
  const course = await requireCourseOwner(input.courseId, caller.uid);
  const email = caller.email ?? (await auth().getUser(caller.uid)).email;
  if (!email) throw new HttpsError("failed-precondition", "Aucun email sur ton compte");
  const [settingsSnap, creatorSnap] = await Promise.all([
    db().doc(`courses/${input.courseId}/private/settings`).get(),
    db().doc(`creators/${caller.uid}`).get(),
  ]);
  await db()
    .collection("mail")
    .add(
      buildWelcomeEmail({
        to: email,
        studentName: "Prénom",
        courseTitle: course.title,
        settings: settingsSnap.data() as CoursePrivateSettings | undefined,
        brand: brandFromCreator(creatorSnap.data() as never),
        ctaUrl: `${APP_URL.value()}/formations/${input.courseId}`,
        activation: false,
      }),
    );
  return { email };
});

/** Infos d'une invitation (page publique /bienvenue/[token]). */
export const getInvite = onCall(async (request) => {
  const input = parseInput(inviteTokenInput, request.data);
  return readInvite(input.token);
});

/** Active un compte invité : mot de passe + nom. Le client se connecte ensuite. */
export const acceptInvite = onCall(async (request) => {
  const input = parseInput(acceptInviteInput, request.data);
  return acceptInviteImpl(input);
});

/** Récupère titre, durée et miniature d'une vidéo Vimeo. */
export const resolveVimeoVideo = onCall({ secrets: [VIMEO_ACCESS_TOKEN] }, async (request) => {
  requireCreator(request);
  const input = parseInput(resolveVimeoInput, request.data);
  let token: string | null = null;
  try {
    token = VIMEO_ACCESS_TOKEN.value() || null;
  } catch {
    token = null;
  }
  try {
    return await resolveVimeo(input.url, token, APP_URL.value());
  } catch (error) {
    throw new HttpsError("failed-precondition", (error as Error).message);
  }
});

/** Notifications à la création d'un commentaire. */
export const onCommentCreated = onDocumentCreated(
  "courses/{courseId}/comments/{commentId}",
  async (event) => {
    const comment = event.data?.data() as CommentDoc | undefined;
    if (!comment) return;
    // Écritures avec des IDs déterministes (set) : un déclencheur rejoué est sans effet.
    try {
      await handleNewComment(
        event.params.courseId,
        event.params.commentId,
        comment,
        APP_URL.value(),
      );
    } catch (error) {
      logger.error("onCommentCreated", error);
      throw error;
    }
  },
);
