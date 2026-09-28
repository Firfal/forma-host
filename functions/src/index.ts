import "./setup";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import Stripe from "stripe";
import { logger } from "firebase-functions";
import {
  acceptInviteInput,
  courseIdInput,
  courseStudentInput,
  grantAccessInput,
  inviteTokenInput,
  resolveVimeoInput,
} from "@shared/schemas";
import {
  approveCreatorRequestInput,
  rejectCreatorRequestInput,
  type CreatorRequestDoc,
} from "@shared/creator-requests";
import { publishAnnouncementInput } from "@shared/announcements";
import { issueCertificateInput } from "@shared/certificates-input";
import { askAssistantInput, assistantKeyInput } from "@shared/assistant";
import { submitQuizInput } from "@shared/quiz";
import type { MessageDoc } from "@shared/chat";
import { openConversationInput, updateConversationInput } from "@shared/chat-input";
import type { CommunityPostDoc, CommunityReplyDoc } from "@shared/community";
import { setCommunityInput } from "@shared/community-input";
import type { FeedbackDoc, SubmissionDoc } from "@shared/exercises";
import type { LiveDoc } from "@shared/lives";
import { webhookIdInput, webhookInput } from "@shared/webhooks";
import type { CertificateDoc } from "@shared/certificates";
import type { OrderDoc } from "@shared/payments";
import { schoolDomainInput } from "@shared/domains";
import { formatPostalAddress } from "@shared/invoices";
import { schoolLegalInput } from "@shared/legal";
import { mailSettingsInput } from "@shared/mail-settings";
import { salesSettingsInput } from "@shared/sales-settings";
import {
  checkPromoInput,
  createCheckoutInput,
  promoCodeIdInput,
  promoCodeInput,
} from "@shared/payments-input";
import { inviteSchoolAdminInput, removeSchoolAdminInput, schoolIdInput } from "@shared/school";
import { schoolProfileInput } from "@shared/school";
import { vimeoSettingsInput } from "@shared/vimeo-settings";
import { enrollmentId, paths, routes } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type {
  CommentDoc,
  CourseDoc,
  CoursePrivateSettings,
  CreatorDoc,
  EnrollmentDoc,
  NotificationDoc,
} from "@shared/types";
import { grantAccessToStudents, resendAccessEmail } from "./access";
import { auth, db } from "./db";
import {
  parseInput,
  requireAuth,
  requireCourseAdmin,
  requireCreator,
  requirePlatformAdmin,
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
import {
  APP_URL,
  SETTINGS_ENCRYPTION_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  VIMEO_ACCESS_TOKEN,
  settingsKey,
  stripeKey,
} from "./params";
import { saveSalesSettings as saveSalesSettingsImpl } from "./sales-settings";
import {
  checkPromoCode as checkPromoCodeImpl,
  completeCheckout,
  connectStripe as connectStripeImpl,
  createCheckout,
  createPromoCode as createPromoCodeImpl,
  deactivatePromoCode as deactivatePromoCodeImpl,
  fakePaymentsClient,
  paymentErrorMessage,
  recordInstallmentFailed,
  recordInstallmentPaid,
  recordInstallmentsEnded,
  refreshStripeAccount,
  refundOrder,
  stripeClient,
  syncPromoCodes as syncPromoCodesImpl,
  type PaymentsClient,
} from "./payments";
import { handleNewComment } from "./comments";
import {
  approveCreatorRequest as approveCreatorRequestImpl,
  handleCreatorRequestCreated,
  rejectCreatorRequest as rejectCreatorRequestImpl,
} from "./creator-requests";
import {
  addSchoolDomain as addSchoolDomainImpl,
  appHostingDomains,
  DomainError,
  fakeDomains,
  refreshSchoolDomain as refreshSchoolDomainImpl,
  removeSchoolDomain as removeSchoolDomainImpl,
  schoolBaseUrl,
  syncPendingDomains,
} from "./domains";
import {
  inviteSchoolAdmin as inviteSchoolAdminImpl,
  removeSchoolAdmin as removeSchoolAdminImpl,
  SchoolError,
  updateSchoolProfile as updateSchoolProfileImpl,
} from "./schools";
import { fakeSmtpClient, smtpClient, smtpErrorMessage } from "./smtp";
import { publishAnnouncement as publishAnnouncementImpl } from "./announcements";
import { CertificateError, issueCertificate as issueCertificateImpl } from "./certificates";
import { issueMissingInvoices as issueMissingInvoicesImpl } from "./invoices";
import {
  handleEnrollmentWritten,
  handleNewPost,
  handleNewReply,
  handlePostDeleted,
  handleReplyDeleted,
  setCommunityEnabled,
} from "./community";
import { handleNewFeedback, handleNewSubmission, handleSubmissionReviewed } from "./exercises";
import { handleNewLive } from "./lives";
import {
  WebhookError,
  deleteWebhook as deleteWebhookImpl,
  dispatchWebhookEvent,
  fakeSender,
  httpSender,
  saveWebhook as saveWebhookImpl,
  testWebhook as testWebhookImpl,
} from "./webhooks";
import {
  AssistantError,
  anthropicAssistant,
  askAssistant as askAssistantImpl,
  deleteAssistantKey as deleteAssistantKeyImpl,
  fakeAssistant,
  saveAssistantKey as saveAssistantKeyImpl,
} from "./assistant";
import { platformOverview as platformOverviewImpl } from "./platform";
import { QuizError, submitQuiz as submitQuizImpl } from "./quiz";
import { resolveVimeo } from "./vimeo";
import {
  deleteVimeoSettings as deleteVimeoSettingsImpl,
  fetchVimeoMe,
  loadVimeoToken,
  saveVimeoSettings as saveVimeoSettingsImpl,
  VimeoSetupError,
} from "./vimeo-settings";
import { fakePushSender, fcmSender, isNewNotification, pushNotification } from "./push";
import {
  ChatError,
  handleNewMessage,
  openConversation as openConversationImpl,
  updateConversation as updateConversationImpl,
} from "./chat";

// SMTP simulé uniquement dans les émulateurs (SMTP_FAKE=true dans functions/.env.demo-forma).
const fakeSmtp = process.env.FUNCTIONS_EMULATOR === "true" && process.env.SMTP_FAKE === "true";
const mailDeps = { key: settingsKey, client: fakeSmtp ? fakeSmtpClient : smtpClient };

// App Hosting simulé dans les émulateurs (DOMAINS_FAKE=true) : aucun appel réel.
const domainsClient =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.DOMAINS_FAKE === "true"
    ? fakeDomains
    : appHostingDomains;

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
    appUrl: await schoolBaseUrl(course.creatorId, APP_URL.value()),
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
      appUrl: await schoolBaseUrl(course.creatorId, APP_URL.value()),
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
        ctaUrl: `${await schoolBaseUrl(course.creatorId, APP_URL.value())}/formations/${input.courseId}`,
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
        await schoolBaseUrl(comment.creatorId, APP_URL.value()),
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

// FCM simulé dans les émulateurs (PUSH_FAKE=true) : envois consignés dans _fakePush.
const pushSender =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.PUSH_FAKE === "true"
    ? fakePushSender
    : fcmSender;

/**
 * Chaque notification in-app part aussi en push sur les appareils activés dans Mon compte :
 * à sa création, et quand elle est réémise (nouvelle date, ex. nouveau message du chat).
 */
export const onNotificationWritten = onDocumentWritten(
  "users/{uid}/notifications/{notificationId}",
  async (event) => {
    const before = event.data?.before.data() as NotificationDoc | undefined;
    const after = event.data?.after.data() as NotificationDoc | undefined;
    if (!after || !isNewNotification(before, after)) return;
    try {
      await pushNotification(event.params.uid, event.params.notificationId, after, pushSender);
    } catch (error) {
      logger.error("onNotificationWritten", error);
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

/** Informations légales de l'école (pages légales publiques, factures). */
export const saveSchoolLegal = onCall(async (request) => {
  const { schoolId: target, ...info } = parseInput(schoolLegalInput, request.data);
  const schoolId = target ?? request.auth?.uid ?? "";
  requireSchoolAdmin(request, schoolId);
  if (!(await db().doc(`creators/${schoolId}`).get()).exists) {
    throw new HttpsError("not-found", "École introuvable");
  }
  await db()
    .doc(`creators/${schoolId}/legal/info`)
    .set({ ...info, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/** Réglages de vente de l'école (impayés, facturation) : propriétaire de l'école. */
export const saveSalesSettings = onCall(async (request) => {
  const caller = await requireSchoolOwner(request);
  const input = parseInput(salesSettingsInput, request.data);
  await saveSalesSettingsImpl(caller.uid, input);
  return { ok: true };
});

/** Factures des ventes passées avant la saisie des informations légales. */
export const issueMissingInvoices = onCall(async (request) => {
  const input = parseInput(schoolIdInput, request.data);
  const schoolId = input.schoolId ?? request.auth?.uid ?? "";
  requireSchoolAdmin(request, schoolId);
  if (!(await db().doc(`creators/${schoolId}/legal/info`).get()).exists) {
    throw new HttpsError(
      "failed-precondition",
      "Complète d'abord les informations légales (Paramètres).",
    );
  }
  return { issued: await issueMissingInvoicesImpl(schoolId) };
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
      appUrl: await schoolBaseUrl(caller.uid, APP_URL.value()),
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

function domainError(error: unknown): never {
  if (error instanceof DomainError) throw new HttpsError("failed-precondition", error.message);
  logger.error("domaine", error);
  throw new HttpsError("internal", "Opération sur le domaine impossible pour le moment.");
}

/** Relie un domaine personnalisé à l'école (propriétaire) et retourne les DNS à configurer. */
export const addSchoolDomain = onCall({ timeoutSeconds: 60 }, async (request) => {
  const caller = await requireSchoolOwner(request);
  const input = parseInput(schoolDomainInput, request.data);
  try {
    return await addSchoolDomainImpl(caller.uid, input.host, domainsClient, APP_URL.value());
  } catch (error) {
    domainError(error);
  }
});

/** Vérifie l'état du domaine (DNS public, App Hosting, certificat HTTPS). */
export const refreshSchoolDomain = onCall({ timeoutSeconds: 60 }, async (request) => {
  const caller = await requireSchoolOwner(request);
  try {
    return await refreshSchoolDomainImpl(caller.uid, domainsClient, APP_URL.value());
  } catch (error) {
    domainError(error);
  }
});

/** Domaines en attente vérifiés toutes les 10 minutes : email au formateur dès l'activation. */
export const checkPendingDomains = onSchedule(
  { schedule: "every 10 minutes", timeoutSeconds: 300 },
  async () => {
    const result = await syncPendingDomains(domainsClient, APP_URL.value());
    if (result.checked || result.failed) logger.info("Domaines en attente", result);
  },
);

export const removeSchoolDomain = onCall(async (request) => {
  const caller = await requireSchoolOwner(request);
  try {
    await removeSchoolDomainImpl(caller.uid, domainsClient);
  } catch (error) {
    domainError(error);
  }
  return { ok: true };
});

/** Annonce aux élèves inscrits d'une formation (notification, email si demandé). */
export const publishAnnouncement = onCall({ timeoutSeconds: 300 }, async (request) => {
  const input = parseInput(publishAnnouncementInput, request.data);
  const { caller, course } = await requireCourseAdmin(request, input.courseId);
  const authorName =
    (request.auth?.token.name as string | undefined) ?? caller.email?.split("@")[0] ?? "L'équipe";
  return publishAnnouncementImpl({
    input,
    course,
    authorName,
    appUrl: await schoolBaseUrl(course.creatorId, APP_URL.value()),
  });
});

/** Certificat de réussite (élève ayant terminé toutes les leçons) : retourne son identifiant. */
export const issueCertificate = onCall(async (request) => {
  const caller = requireAuth(request);
  const input = parseInput(issueCertificateInput, request.data);
  try {
    return { id: await issueCertificateImpl({ ...input, uid: caller.uid }) };
  } catch (error) {
    if (error instanceof CertificateError) {
      throw new HttpsError("failed-precondition", error.message);
    }
    throw error;
  }
});

/** Tentative de quiz : correction côté serveur (les bonnes réponses restent cachées). */
export const submitQuiz = onCall(async (request) => {
  const caller = requireAuth(request);
  const input = parseInput(submitQuizInput, request.data);
  try {
    return await submitQuizImpl({ ...input, uid: caller.uid });
  } catch (error) {
    if (error instanceof QuizError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
});

/** Communauté d'école : ouverture (et adhésion des élèves actuels) ou fermeture. */
export const setCommunity = onCall({ timeoutSeconds: 300 }, async (request) => {
  const input = parseInput(setCommunityInput, request.data);
  requireSchoolAdmin(request, input.schoolId);
  await setCommunityEnabled(input.schoolId, input.enabled);
  return { ok: true };
});

/** Inscription créée ou modifiée : l'adhésion à la communauté de l'école suit. */
export const onEnrollmentWritten = onDocumentWritten(
  "enrollments/{enrollmentId}",
  async (event) => {
    const before = event.data?.before.data() as EnrollmentDoc | undefined;
    const after = event.data?.after.data() as EnrollmentDoc | undefined;
    try {
      await handleEnrollmentWritten(before, after);
    } catch (error) {
      logger.error("onEnrollmentWritten", error);
    }
    // Webhook « nouvel élève » : accès ouvert (création ou accès rétabli).
    if (after?.status === "active" && before?.status !== "active") {
      try {
        const course = (await db().doc(`courses/${after.courseId}`).get()).data() as
          CourseDoc | undefined;
        await dispatchWebhookEvent({
          schoolId: after.creatorId,
          event: "student.enrolled",
          deliveryId: `student.enrolled_${event.params.enrollmentId}_${event.id}`,
          data: {
            courseId: after.courseId,
            courseTitle: course?.title ?? null,
            email: after.email,
            name: after.displayName,
            source: after.source,
          },
          sender: webhookSender,
        });
      } catch (error) {
        logger.error("webhook student.enrolled", error);
      }
    }
  },
);

/** Vente payée : webhook « order.paid » de l'école. */
export const onOrderWritten = onDocumentWritten("orders/{orderId}", async (event) => {
  const before = event.data?.before.data() as OrderDoc | undefined;
  const after = event.data?.after.data() as OrderDoc | undefined;
  if (after?.status !== "paid" || before?.status === "paid") return;
  try {
    await dispatchWebhookEvent({
      schoolId: after.schoolId,
      event: "order.paid",
      deliveryId: `order.paid_${event.params.orderId}`,
      data: {
        orderId: event.params.orderId,
        courseId: after.courseId,
        courseTitle: after.courseTitle ?? null,
        email: after.email,
        name: after.name,
        amount: after.amount,
        currency: after.currency,
        promoCode: after.promoCode,
        installments: after.installments?.count ?? null,
        livemode: Boolean(after.livemode),
      },
      sender: webhookSender,
    });
  } catch (error) {
    logger.error("webhook order.paid", error);
  }
});

/** Certificat délivré : webhook « certificate.issued » de l'école. */
export const onCertificateCreated = onDocumentCreated(
  "certificates/{certificateId}",
  async (event) => {
    const certificate = event.data?.data() as CertificateDoc | undefined;
    if (!certificate) return;
    try {
      await dispatchWebhookEvent({
        schoolId: certificate.schoolId,
        event: "certificate.issued",
        deliveryId: `certificate.issued_${event.params.certificateId}`,
        data: {
          certificateId: event.params.certificateId,
          courseId: certificate.courseId,
          courseTitle: certificate.courseTitle,
          studentName: certificate.studentName,
          url: `${APP_URL.value()}${routes.certificate(event.params.certificateId)}`,
        },
        sender: webhookSender,
      });
    } catch (error) {
      logger.error("webhook certificate.issued", error);
    }
  },
);

// Webhooks simulés dans les émulateurs (WEBHOOKS_FAKE=true) : livraisons dans _fakeWebhooks.
const webhookSender =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.WEBHOOKS_FAKE === "true"
    ? fakeSender
    : httpSender;

function webhookHttpError(error: unknown): never {
  if (error instanceof WebhookError) throw new HttpsError("failed-precondition", error.message);
  throw error;
}

/** Nouveau webhook (Zapier, Make…) de l'école : clé de signature générée par le serveur. */
export const saveWebhook = onCall(async (request) => {
  const input = parseInput(webhookInput, request.data);
  requireSchoolAdmin(request, input.schoolId);
  try {
    return await saveWebhookImpl(input);
  } catch (error) {
    webhookHttpError(error);
  }
});

export const deleteWebhook = onCall(async (request) => {
  const input = parseInput(webhookIdInput, request.data);
  requireSchoolAdmin(request, input.schoolId);
  await deleteWebhookImpl(input.schoolId, input.webhookId);
  return { ok: true };
});

/** Envoie un événement de test et retourne le code HTTP reçu. */
export const testWebhook = onCall(async (request) => {
  const input = parseInput(webhookIdInput, request.data);
  requireSchoolAdmin(request, input.schoolId);
  try {
    return await testWebhookImpl(input.schoolId, input.webhookId, webhookSender);
  } catch (error) {
    webhookHttpError(error);
  }
});

export const onCommunityPostCreated = onDocumentCreated(
  "communities/{schoolId}/posts/{postId}",
  async (event) => {
    const post = event.data?.data() as CommunityPostDoc | undefined;
    if (!post) return;
    try {
      await handleNewPost(event.params.schoolId, event.params.postId, post);
    } catch (error) {
      logger.error("onCommunityPostCreated", error);
    }
  },
);

export const onCommunityPostDeleted = onDocumentDeleted(
  "communities/{schoolId}/posts/{postId}",
  async (event) => {
    try {
      await handlePostDeleted(event.params.schoolId, event.params.postId);
    } catch (error) {
      logger.error("onCommunityPostDeleted", error);
    }
  },
);

export const onCommunityReplyCreated = onDocumentCreated(
  "communities/{schoolId}/posts/{postId}/replies/{replyId}",
  async (event) => {
    const reply = event.data?.data() as CommunityReplyDoc | undefined;
    if (!reply) return;
    try {
      await handleNewReply(event.params.schoolId, event.params.postId, event.params.replyId, reply);
    } catch (error) {
      logger.error("onCommunityReplyCreated", error);
    }
  },
);

export const onCommunityReplyDeleted = onDocumentDeleted(
  "communities/{schoolId}/posts/{postId}/replies/{replyId}",
  async (event) => {
    try {
      await handleReplyDeleted(event.params.schoolId, event.params.postId);
    } catch (error) {
      logger.error("onCommunityReplyDeleted", error);
    }
  },
);

/** Direct programmé : les élèves inscrits sont prévenus (in-app). */
export const onLiveCreated = onDocumentCreated(
  "courses/{courseId}/lives/{liveId}",
  async (event) => {
    const live = event.data?.data() as LiveDoc<Timestamp> | undefined;
    if (!live) return;
    try {
      await handleNewLive(event.params.courseId, event.params.liveId, live);
    } catch (error) {
      logger.error("onLiveCreated", error);
    }
  },
);

/** Exercice rendu : l'équipe de l'école est prévenue (in-app). */
export const onSubmissionCreated = onDocumentCreated(
  "submissions/{submissionId}",
  async (event) => {
    const submission = event.data?.data() as SubmissionDoc | undefined;
    if (!submission) return;
    try {
      await handleNewSubmission(event.params.submissionId, submission);
    } catch (error) {
      logger.error("onSubmissionCreated", error);
    }
    try {
      await dispatchWebhookEvent({
        schoolId: submission.creatorId,
        event: "submission.created",
        deliveryId: `submission.created_${event.params.submissionId}`,
        data: {
          submissionId: event.params.submissionId,
          courseId: submission.courseId,
          lessonTitle: submission.lessonTitle,
          studentName: submission.studentName,
          url: `${APP_URL.value()}${routes.adminSubmission(event.params.submissionId)}`,
        },
        sender: webhookSender,
      });
    } catch (error) {
      logger.error("webhook submission.created", error);
    }
  },
);

/** Exercice marqué corrigé : l'élève est prévenu. */
export const onSubmissionUpdated = onDocumentUpdated(
  "submissions/{submissionId}",
  async (event) => {
    try {
      await handleSubmissionReviewed(
        event.params.submissionId,
        event.data?.before.data() as SubmissionDoc | undefined,
        event.data?.after.data() as SubmissionDoc | undefined,
      );
    } catch (error) {
      logger.error("onSubmissionUpdated", error);
    }
  },
);

/** Retour sur un exercice : l'élève (ou l'équipe, si c'est l'élève qui répond) est prévenu. */
export const onSubmissionFeedbackCreated = onDocumentCreated(
  "submissions/{submissionId}/feedback/{feedbackId}",
  async (event) => {
    const feedback = event.data?.data() as FeedbackDoc | undefined;
    if (!feedback) return;
    try {
      await handleNewFeedback(event.params.submissionId, event.params.feedbackId, feedback);
    } catch (error) {
      logger.error("onSubmissionFeedbackCreated", error);
    }
  },
);

// Claude simulé dans les émulateurs (ASSISTANT_FAKE=true) : réponses de démonstration.
const assistantClient =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.ASSISTANT_FAKE === "true"
    ? fakeAssistant
    : anthropicAssistant;

function assistantHttpError(error: unknown): never {
  if (error instanceof AssistantError) throw new HttpsError("failed-precondition", error.message);
  throw error;
}

/** Clé API Anthropic de la plateforme (vérifiée, chiffrée) : active l'assistant IA. */
export const saveAssistantKey = onCall({ secrets: [SETTINGS_ENCRYPTION_KEY] }, async (request) => {
  requirePlatformAdmin(request);
  const input = parseInput(assistantKeyInput, request.data);
  try {
    return await saveAssistantKeyImpl(input.apiKey, { key: settingsKey, client: assistantClient });
  } catch (error) {
    assistantHttpError(error);
  }
});

export const deleteAssistantKey = onCall(async (request) => {
  requirePlatformAdmin(request);
  await deleteAssistantKeyImpl();
  return { ok: true };
});

/** Question d'un élève à l'assistant de la formation (limite quotidienne). */
export const askAssistant = onCall(
  { secrets: [SETTINGS_ENCRYPTION_KEY], timeoutSeconds: 180 },
  async (request) => {
    const caller = requireAuth(request);
    const input = parseInput(askAssistantInput, request.data);
    try {
      return await askAssistantImpl(
        {
          input,
          uid: caller.uid,
          schools: (request.auth?.token.schools as string[] | undefined) ?? [],
        },
        { key: settingsKey, client: assistantClient },
      );
    } catch (error) {
      assistantHttpError(error);
    }
  },
);

/** Vue d'ensemble de la plateforme (écoles, inscriptions, ventes) : administrateurs seulement. */
export const platformOverview = onCall({ timeoutSeconds: 120 }, async (request) => {
  requirePlatformAdmin(request);
  return platformOverviewImpl();
});

/** Nouvelle demande d'espace formateur : les administrateurs de la plateforme sont prévenus. */
export const onCreatorRequestCreated = onDocumentCreated("creatorRequests/{uid}", async (event) => {
  const request = event.data?.data() as CreatorRequestDoc | undefined;
  if (!request) return;
  try {
    await handleCreatorRequestCreated(request, APP_URL.value());
  } catch (error) {
    logger.error("onCreatorRequestCreated", error);
  }
});

/** Accepte une demande : l'école est créée avec l'adresse retenue. */
export const approveCreatorRequest = onCall(async (request) => {
  const caller = requirePlatformAdmin(request);
  const input = parseInput(approveCreatorRequestInput, request.data);
  try {
    await approveCreatorRequestImpl({
      uid: input.uid,
      slug: input.slug,
      deciderUid: caller.uid,
      appUrl: APP_URL.value(),
    });
  } catch (error) {
    if (error instanceof SchoolError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
  return { ok: true };
});

export const rejectCreatorRequest = onCall(async (request) => {
  const caller = requirePlatformAdmin(request);
  const input = parseInput(rejectCreatorRequestInput, request.data);
  try {
    await rejectCreatorRequestImpl({
      uid: input.uid,
      reason: input.reason ?? null,
      deciderUid: caller.uid,
      appUrl: APP_URL.value(),
    });
  } catch (error) {
    if (error instanceof SchoolError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
  return { ok: true };
});

// Stripe simulé dans les émulateurs (STRIPE_FAKE=true) : aucun appel réel, paiement immédiat.
const fakePayments =
  process.env.FUNCTIONS_EMULATOR === "true" && process.env.STRIPE_FAKE === "true";

function paymentsClient(): PaymentsClient {
  if (fakePayments) return fakePaymentsClient();
  const key = stripeKey();
  if (!key) {
    throw new HttpsError(
      "failed-precondition",
      "Les paiements ne sont pas encore activés sur la plateforme.",
    );
  }
  return stripeClient(key);
}

function paymentError(error: unknown): never {
  if (error instanceof HttpsError) throw error;
  logger.warn("paiement", error);
  throw new HttpsError("failed-precondition", paymentErrorMessage(error));
}

const appUrlFor = (schoolId: string) => schoolBaseUrl(schoolId, APP_URL.value());

/** Relie le compte Stripe de l'école (propriétaire) : retourne le lien d'onboarding Stripe. */
export const connectStripe = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const caller = await requireSchoolOwner(request);
  const email = await callerEmail(caller);
  try {
    const url = await connectStripeImpl({
      schoolId: caller.uid,
      email,
      appUrl: await appUrlFor(caller.uid),
      client: paymentsClient(),
    });
    return { url };
  } catch (error) {
    paymentError(error);
  }
});

/** Relit l'état du compte Stripe (retour de l'onboarding). */
export const refreshStripeStatus = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const caller = await requireSchoolOwner(request);
  try {
    const stripe = await refreshStripeAccount(caller.uid, paymentsClient());
    return { chargesEnabled: stripe?.chargesEnabled ?? false };
  } catch (error) {
    paymentError(error);
  }
});

/** Paiement d'une formation (visiteur ou élève connecté) : URL de la page de paiement Stripe. */
export const createCheckoutSession = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const input = parseInput(createCheckoutInput, request.data);
  const email = request.auth?.token.email ?? null;
  try {
    const client = paymentsClient();
    const course = (await db().doc(`courses/${input.courseId}`).get()).data() as
      { creatorId: string } | undefined;
    const appUrl = course ? await appUrlFor(course.creatorId) : APP_URL.value();
    const termsAcceptedAt = new Date().toISOString();
    const session = await createCheckout({
      courseId: input.courseId,
      email,
      appUrl,
      client,
      termsAcceptedAt,
      installments: input.installments ?? null,
      promoCode: input.promoCode ?? null,
    });
    if (fakePayments && course) {
      // Émulateurs : paiement simulé, validé tout de suite (le webhook ne passe pas).
      const stripe = (await db().doc(`creators/${course.creatorId}/private/stripe`).get()).data();
      await completeCheckout(
        {
          sessionId: session.id,
          accountId: stripe?.accountId,
          courseId: input.courseId,
          email: email ?? "acheteur@exemple.fr",
          name: null,
          amount: session.total,
          currency: "eur",
          paymentIntentId: input.installments ? null : `pi_${session.id}`,
          promoCode: session.promo?.code ?? null,
          promoId: session.promo?.id ?? null,
          stripeInvoiceId: input.installments ? `in_${session.id}_1` : `in_${session.id}`,
          livemode: false,
          termsAcceptedAt,
          installments: input.installments
            ? {
                count: input.installments,
                subscriptionId: `sub_${session.id}`,
                customerId: `cus_${session.id}`,
                firstInvoiceId: `in_${session.id}_1`,
              }
            : null,
        },
        appUrlFor,
        client,
      );
    }
    return { url: session.url };
  } catch (error) {
    paymentError(error);
  }
});

/** Vérifie un code promo dans la fenêtre de commande (visiteur ou élève connecté). */
export const checkPromoCode = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const input = parseInput(checkPromoInput, request.data);
  try {
    return await checkPromoCodeImpl(input.courseId, input.code, paymentsClient());
  } catch (error) {
    paymentError(error);
  }
});

export const createPromoCode = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const input = parseInput(promoCodeInput, request.data);
  await requireCourseAdmin(request, input.courseId);
  try {
    return { id: await createPromoCodeImpl(input, paymentsClient()) };
  } catch (error) {
    paymentError(error);
  }
});

/** Met à jour le nombre d'utilisations des codes promo de la formation. */
export const syncPromoCodes = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const input = parseInput(courseIdInput, request.data);
  await requireCourseAdmin(request, input.courseId);
  try {
    await syncPromoCodesImpl(input.courseId, paymentsClient());
  } catch (error) {
    paymentError(error);
  }
  return { ok: true };
});

export const deactivatePromoCode = onCall({ secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const input = parseInput(promoCodeIdInput, request.data);
  await requireCourseAdmin(request, input.courseId);
  try {
    await deactivatePromoCodeImpl(input.courseId, input.promoId, paymentsClient());
  } catch (error) {
    paymentError(error);
  }
  return { ok: true };
});

/**
 * Webhook Stripe Connect (créé par bootstrap-firebase.ts) : paiement réussi → accès ;
 * compte mis à jour → état du compte ; remboursement total → accès retiré.
 */
export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const key = stripeKey();
    let secret = "";
    try {
      secret = STRIPE_WEBHOOK_SECRET.value();
    } catch {
      secret = "";
    }
    if (!key || !secret || secret === "unset") {
      res.status(503).send("Paiements non activés");
      return;
    }
    let event: Stripe.Event;
    try {
      event = new Stripe(key).webhooks.constructEvent(
        req.rawBody,
        req.headers["stripe-signature"] as string,
        secret,
      );
    } catch {
      res.status(400).send("Signature invalide");
      return;
    }
    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as Stripe.Checkout.Session;
          const email = session.customer_details?.email;
          const courseId = session.metadata?.courseId;
          if (session.payment_status !== "paid" || !event.account || !email || !courseId) break;
          const count = Number(session.metadata?.installments) || 0;
          const idOf = (value: string | { id: string } | null) =>
            typeof value === "string" ? value : (value?.id ?? null);
          await completeCheckout(
            {
              sessionId: session.id,
              accountId: event.account,
              courseId,
              email,
              name: session.customer_details?.name ?? null,
              // Plusieurs fois : prix total de la formation (la session ne porte que la 1re échéance).
              amount:
                session.mode === "subscription"
                  ? Number(session.metadata?.totalAmount) || (session.amount_total ?? 0)
                  : (session.amount_total ?? 0),
              currency: session.currency ?? "eur",
              paymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
              promoCode: session.metadata?.promoCode || null,
              promoId: session.metadata?.promoId || null,
              stripeInvoiceId: idOf(session.invoice),
              livemode: event.livemode,
              termsAcceptedAt: session.metadata?.termsAcceptedAt ?? null,
              billingAddress: formatPostalAddress(session.customer_details?.address),
              installments:
                session.mode === "subscription" && count > 1
                  ? {
                      count,
                      subscriptionId: idOf(session.subscription),
                      customerId: idOf(session.customer),
                      firstInvoiceId: idOf(session.invoice),
                    }
                  : null,
            },
            appUrlFor,
            stripeClient(key),
          );
          break;
        }
        case "invoice.paid":
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subscription = invoice.parent?.subscription_details?.subscription;
          const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id;
          if (!subscriptionId || !event.account || !invoice.id) break;
          if (event.type === "invoice.paid") {
            await recordInstallmentPaid({
              accountId: event.account,
              subscriptionId,
              invoiceId: invoice.id,
              client: stripeClient(key),
              invoice: {
                id: invoice.id,
                number: invoice.number ?? null,
                url: invoice.hosted_invoice_url ?? null,
                amount: invoice.amount_paid,
              },
            });
          } else {
            await recordInstallmentFailed(subscriptionId);
          }
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await recordInstallmentsEnded(subscription.id);
          break;
        }
        case "account.updated": {
          const account = event.data.object as Stripe.Account;
          const mapping = (await db().doc(`stripeAccounts/${account.id}`).get()).data() as
            { schoolId: string } | undefined;
          if (!mapping) break;
          const ref = db().doc(`creators/${mapping.schoolId}/private/stripe`);
          const current = (await ref.get()).data() as { accountId?: string } | undefined;
          // Ancien compte de l'école (ex. compte de test après le passage en réel) : ignoré.
          if (current?.accountId === account.id) {
            await ref.update({
              chargesEnabled: Boolean(account.charges_enabled),
              detailsSubmitted: Boolean(account.details_submitted),
            });
          }
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          const paymentIntent =
            typeof charge.payment_intent === "string"
              ? charge.payment_intent
              : charge.payment_intent?.id;
          const customer =
            typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null);
          if (charge.refunded && event.account) {
            await refundOrder(paymentIntent ?? null, {
              customerId: customer,
              accountId: event.account,
              client: stripeClient(key),
            });
          }
          break;
        }
        default:
          break;
      }
      res.status(200).send("ok");
    } catch (error) {
      logger.error("stripeWebhook", event.type, error);
      res.status(500).send("Erreur");
    }
  },
);

/** Ouvre la conversation avec l'école (élève) ou avec un élève (équipe de l'école). */
export const openConversation = onCall(async (request) => {
  const caller = requireAuth(request);
  const input = parseInput(openConversationInput, request.data);
  try {
    return await openConversationImpl(caller, input);
  } catch (error) {
    if (error instanceof ChatError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
});

/** Archiver, bloquer (équipe) ou mettre en sourdine une conversation. */
export const updateConversation = onCall(async (request) => {
  const caller = requireAuth(request);
  const input = parseInput(updateConversationInput, request.data);
  try {
    await updateConversationImpl(caller, input);
  } catch (error) {
    if (error instanceof ChatError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
  return { ok: true };
});

export const onMessageCreated = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data() as MessageDoc | undefined;
    if (!message) return;
    try {
      await handleNewMessage(
        event.params.conversationId,
        event.params.messageId,
        message,
        APP_URL.value(),
      );
    } catch (error) {
      logger.error("onMessageCreated", error);
    }
  },
);
