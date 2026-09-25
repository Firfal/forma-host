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
import { mailSettingsInput } from "@shared/mail-settings";
import { enrollmentId, paths } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type { CommentDoc, CoursePrivateSettings, CreatorDoc } from "@shared/types";
import { grantAccessToStudents, resendAccessEmail } from "./access";
import { auth, db } from "./db";
import { parseInput, requireCourseOwner, requireCreator } from "./guards";
import { acceptInvite as acceptInviteImpl, readInvite } from "./invites";
import { brandFromCreator, buildWelcomeEmail } from "./mail";
import { deliverMail, resendWaitingMail } from "./mail-delivery";
import {
  deleteMailSettings as deleteMailSettingsImpl,
  loadSmtpConfig,
  recordSendResult,
  saveMailSettings as saveMailSettingsImpl,
} from "./mail-settings";
import { APP_URL, SETTINGS_ENCRYPTION_KEY, VIMEO_ACCESS_TOKEN, settingsKey } from "./params";
import { handleNewComment } from "./comments";
import { fakeSmtpClient, smtpClient, smtpErrorMessage } from "./smtp";
import { resolveVimeo } from "./vimeo";

// SMTP simulé uniquement dans les émulateurs (SMTP_FAKE=true dans functions/.env.demo-forma).
const fakeSmtp = process.env.FUNCTIONS_EMULATOR === "true" && process.env.SMTP_FAKE === "true";
const mailDeps = { key: settingsKey, client: fakeSmtp ? fakeSmtpClient : smtpClient };

async function callerEmail(caller: { uid: string; email: string | null }): Promise<string> {
  const email = caller.email ?? (await auth().getUser(caller.uid)).email;
  if (!email) throw new HttpsError("failed-precondition", "Aucun email sur ton compte");
  return email;
}

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
  const email = await callerEmail(caller);
  const [settingsSnap, creatorSnap, mailSettingsSnap] = await Promise.all([
    db().doc(`courses/${input.courseId}/private/settings`).get(),
    db().doc(`creators/${caller.uid}`).get(),
    db().doc(paths.creatorMailSettings(caller.uid)).get(),
  ]);
  if (!mailSettingsSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Configure d'abord l'envoi des emails dans Paramètres.",
    );
  }
  await db()
    .collection("mail")
    .add(
      buildWelcomeEmail({
        creatorId: caller.uid,
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

/** Vérifie la connexion SMTP, enregistre les réglages et envoie les emails en attente. */
export const saveMailSettings = onCall(
  { secrets: [SETTINGS_ENCRYPTION_KEY], timeoutSeconds: 300 },
  async (request) => {
    const caller = requireCreator(request);
    const input = parseInput(mailSettingsInput, request.data);
    try {
      await saveMailSettingsImpl(caller.uid, input, mailDeps);
    } catch (error) {
      logger.warn("saveMailSettings", { uid: caller.uid, code: (error as { code?: string }).code });
      throw new HttpsError("failed-precondition", smtpErrorMessage(error));
    }
    return resendWaitingMail(caller.uid, mailDeps);
  },
);

/** Désactive l'envoi des emails (les prochains restent en attente). */
export const deleteMailSettings = onCall(async (request) => {
  const caller = requireCreator(request);
  await deleteMailSettingsImpl(caller.uid);
  return { ok: true };
});

/** Envoie tout de suite un email de test au formateur avec ses réglages. */
export const sendTestMail = onCall({ secrets: [SETTINGS_ENCRYPTION_KEY] }, async (request) => {
  const caller = requireCreator(request);
  const email = await callerEmail(caller);
  const [config, creatorSnap] = await Promise.all([
    loadSmtpConfig(caller.uid, settingsKey),
    db().doc(`creators/${caller.uid}`).get(),
  ]);
  if (!config) throw new HttpsError("failed-precondition", "Envoi des emails non configuré");
  const brand = brandFromCreator(creatorSnap.data() as CreatorDoc | undefined);
  const appUrl = APP_URL.value();
  try {
    await mailDeps.client.send(config, {
      to: email,
      subject: "Email de test",
      html: emailLayout({
        bodyHtml: `<p style="margin:0 0 16px">Tout fonctionne : tes élèves recevront leurs emails de la part de <strong>${escapeHtml(config.fromName)}</strong> (${escapeHtml(config.fromEmail)}).</p>`,
        ctaLabel: "Ouvrir l'administration",
        ctaUrl: `${appUrl}/admin`,
        brandName: brand.name,
        brandColor: brand.color,
      }),
      text: `Tout fonctionne : tes élèves recevront leurs emails de la part de ${config.fromName} (${config.fromEmail}).`,
    });
  } catch (error) {
    const message = smtpErrorMessage(error);
    await recordSendResult(caller.uid, message);
    throw new HttpsError("failed-precondition", message);
  }
  await recordSendResult(caller.uid, null);
  return { email };
});

/** Envoie chaque email de la file avec les réglages SMTP de son formateur. */
export const onMailCreated = onDocumentCreated(
  { document: "mail/{mailId}", secrets: [SETTINGS_ENCRYPTION_KEY] },
  async (event) => {
    try {
      await deliverMail(event.params.mailId, mailDeps);
    } catch (error) {
      logger.error("onMailCreated", error);
    }
  },
);
