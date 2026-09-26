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
import { inviteSchoolAdminInput, removeSchoolAdminInput } from "@shared/school";
import { schoolProfileInput } from "@shared/school";
import { vimeoSettingsInput } from "@shared/vimeo-settings";
import { enrollmentId, paths } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type { CommentDoc, CoursePrivateSettings, CreatorDoc } from "@shared/types";
import { grantAccessToStudents, resendAccessEmail } from "./access";
import { auth, db } from "./db";
import {
  parseInput,
  requireCourseAdmin,
  requireCreator,
  requireSchoolAdmin,
  requireSchoolOwner,
} from "./guards";
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
import {
  inviteSchoolAdmin as inviteSchoolAdminImpl,
  removeSchoolAdmin as removeSchoolAdminImpl,
  SchoolError,
  updateSchoolProfile as updateSchoolProfileImpl,
} from "./schools";
import { fakeSmtpClient, smtpClient, smtpErrorMessage } from "./smtp";
import { resolveVimeo } from "./vimeo";
import {
  deleteVimeoSettings as deleteVimeoSettingsImpl,
  fetchVimeoMe,
  loadVimeoToken,
  saveVimeoSettings as saveVimeoSettingsImpl,
  VimeoSetupError,
} from "./vimeo-settings";

// SMTP simulé uniquement dans les émulateurs (SMTP_FAKE=true dans functions/.env.demo-forma).
const fakeSmtp = process.env.FUNCTIONS_EMULATOR === "true" && process.env.SMTP_FAKE === "true";
const mailDeps = { key: settingsKey, client: fakeSmtp ? fakeSmtpClient : smtpClient };

// Vimeo simulé dans les émulateurs (VIMEO_FAKE=true) : le token « refuse » est rejeté.
const fakeVimeo = process.env.FUNCTIONS_EMULATOR === "true" && process.env.VIMEO_FAKE === "true";
async function fakeFetchVimeoMe(token: string) {
  if (token.startsWith("refuse")) throw new VimeoSetupError("Token refusé par Vimeo.");
  return { name: "Compte de démo", account: "basic" };
}

async function callerEmail(caller: { uid: string; email: string | null }): Promise<string> {
  const email = caller.email ?? (await auth().getUser(caller.uid)).email;
  if (!email) throw new HttpsError("failed-precondition", "Aucun email sur ton compte");
  return email;
}

/** Donne l'accès à une formation (invitation unitaire ou import CSV). */
export const grantAccess = onCall({ timeoutSeconds: 300 }, async (request) => {
  const input = parseInput(grantAccessInput, request.data);
  const { course } = await requireCourseAdmin(request, input.courseId);
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
  const input = parseInput(courseStudentInput, request.data);
  await requireCourseAdmin(request, input.courseId);
  const ref = db().doc(`enrollments/${enrollmentId(input.courseId, input.uid)}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Inscription introuvable");
  await ref.update({ status: "revoked" });
  return { ok: true };
});

/** Renvoie le mail d'accès (nouveau lien d'activation si le compte n'est pas activé). */
export const resendInvite = onCall(async (request) => {
  const input = parseInput(courseStudentInput, request.data);
  const { course } = await requireCourseAdmin(request, input.courseId);
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
  const input = parseInput(courseIdInput, request.data);
  const { caller, course } = await requireCourseAdmin(request, input.courseId);
  const email = await callerEmail(caller);
  const [settingsSnap, creatorSnap, mailSettingsSnap] = await Promise.all([
    db().doc(`courses/${input.courseId}/private/settings`).get(),
    db().doc(`creators/${course.creatorId}`).get(),
    db().doc(paths.creatorMailSettings(course.creatorId)).get(),
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
        creatorId: course.creatorId,
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

/**
 * Récupère titre, durée et miniature d'une vidéo Vimeo. Token utilisé : celui de l'école,
 * sinon le token global (secret VIMEO_ACCESS_TOKEN), sinon oEmbed (vidéos publiques).
 */
export const resolveVimeoVideo = onCall(
  { secrets: [VIMEO_ACCESS_TOKEN, SETTINGS_ENCRYPTION_KEY] },
  async (request) => {
    const input = parseInput(resolveVimeoInput, request.data);
    const schoolId = input.schoolId ?? request.auth?.uid ?? "";
    requireSchoolAdmin(request, schoolId);
    let token: string | null = null;
    try {
      token = await loadVimeoToken(schoolId, settingsKey);
    } catch (error) {
      logger.warn("resolveVimeoVideo: token de l'école illisible", error);
    }
    if (!token) {
      try {
        token = VIMEO_ACCESS_TOKEN.value() || null;
      } catch {
        token = null;
      }
    }
    try {
      return await resolveVimeo(input.url, token, APP_URL.value());
    } catch (error) {
      throw new HttpsError("failed-precondition", (error as Error).message);
    }
  },
);

/** Relie un compte Vimeo à l'école : token vérifié auprès de Vimeo, puis chiffré. */
export const saveVimeoSettings = onCall({ secrets: [SETTINGS_ENCRYPTION_KEY] }, async (request) => {
  const caller = await requireSchoolOwner(request);
  const input = parseInput(vimeoSettingsInput, request.data);
  try {
    return await saveVimeoSettingsImpl(caller.uid, input.token, {
      key: settingsKey,
      fetchMe: fakeVimeo ? fakeFetchVimeoMe : fetchVimeoMe,
    });
  } catch (error) {
    if (error instanceof VimeoSetupError) {
      throw new HttpsError("failed-precondition", error.message);
    }
    throw error;
  }
});

export const deleteVimeoSettings = onCall(async (request) => {
  const caller = await requireSchoolOwner(request);
  await deleteVimeoSettingsImpl(caller.uid);
  return { ok: true };
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
    const caller = await requireSchoolOwner(request);
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
  const caller = await requireSchoolOwner(request);
  await deleteMailSettingsImpl(caller.uid);
  return { ok: true };
});

/** Envoie tout de suite un email de test au formateur avec ses réglages. */
export const sendTestMail = onCall({ secrets: [SETTINGS_ENCRYPTION_KEY] }, async (request) => {
  const caller = await requireSchoolOwner(request);
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

/** Profil public de l'école : nom, adresse, logo, couleur, email de support. */
export const updateSchoolProfile = onCall(async (request) => {
  const input = parseInput(schoolProfileInput, request.data);
  const schoolId = input.schoolId ?? request.auth?.uid ?? "";
  requireSchoolAdmin(request, schoolId);
  try {
    await updateSchoolProfileImpl(schoolId, input);
  } catch (error) {
    if (error instanceof SchoolError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
  return { ok: true };
});

/** Invite un co-administrateur dans l'équipe de l'école (propriétaire uniquement). */
export const inviteSchoolAdmin = onCall(async (request) => {
  const caller = await requireSchoolOwner(request);
  const input = parseInput(inviteSchoolAdminInput, request.data);
  const inviter = await auth().getUser(caller.uid);
  try {
    return await inviteSchoolAdminImpl({
      schoolId: caller.uid,
      email: input.email,
      inviterName: inviter.displayName || inviter.email || "Le propriétaire",
      appUrl: APP_URL.value(),
    });
  } catch (error) {
    if (error instanceof SchoolError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
});

/** Retire un co-administrateur de l'équipe (propriétaire uniquement). */
export const removeSchoolAdmin = onCall(async (request) => {
  const caller = await requireSchoolOwner(request);
  const input = parseInput(removeSchoolAdminInput, request.data);
  try {
    await removeSchoolAdminImpl(caller.uid, input.uid);
  } catch (error) {
    if (error instanceof SchoolError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
  return { ok: true };
});
