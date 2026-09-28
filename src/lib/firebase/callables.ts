import type {
  AcceptInviteInput,
  CourseIdInput,
  CourseStudentInput,
  GrantAccessInput,
  GrantAccessResult,
  InviteInfo,
  InviteTokenInput,
  ResolveVimeoInput,
} from "@shared/schemas";
import type { PublishAnnouncementInput } from "@shared/announcements";
import type { IssueCertificateInput } from "@shared/certificates";
import type { AskAssistantInput, AssistantAnswer, AssistantKeyInput } from "@shared/assistant";
import type { PlatformOverview } from "@shared/platform";
import type { WebhookIdInput, WebhookInput } from "@shared/webhooks";
import type { QuizGrade, SubmitQuizInput } from "@shared/quiz";
import type { OpenConversationInput, UpdateConversationInput } from "@shared/chat";
import type { SetCommunityInput } from "@shared/community";
import type {
  ApproveCreatorRequestInput,
  RejectCreatorRequestInput,
} from "@shared/creator-requests";
import type { SchoolDomain, SchoolDomainInput } from "@shared/domains";
import type { SchoolLegalInput } from "@shared/legal";
import type { MailSettingsInput, SaveMailSettingsResult } from "@shared/mail-settings";
import type { CheckedPromo } from "@shared/payments";
import type { SalesSettingsInput } from "@shared/sales-settings";
import type {
  CheckPromoInput,
  CreateCheckoutInput,
  PromoCodeIdInput,
  PromoCodeInput,
} from "@shared/payments-input";
import type {
  InviteSchoolAdminInput,
  RemoveSchoolAdminInput,
  SchoolProfileInput,
} from "@shared/school";
import type { VimeoSettingsInput } from "@shared/vimeo-settings";
import type { VimeoVideo } from "@shared/types";
import { loadFunctions } from "./client";

function callable<I, O>(name: string) {
  return async (input: I): Promise<O> => {
    const { sdk, functions } = await loadFunctions();
    return (await sdk.httpsCallable<I, O>(functions, name)(input)).data;
  };
}

export const callGrantAccess = callable<GrantAccessInput, GrantAccessResult>("grantAccess");
export const callRevokeAccess = callable<CourseStudentInput, { ok: true }>("revokeAccess");
export const callResendInvite = callable<CourseStudentInput, { ok: true }>("resendInvite");
export const callSendTestWelcomeEmail = callable<CourseIdInput, { email: string }>(
  "sendTestWelcomeEmail",
);
export const callGetInvite = callable<InviteTokenInput, InviteInfo>("getInvite");
export const callAcceptInvite = callable<AcceptInviteInput, { email: string }>("acceptInvite");
export const callResolveVimeoVideo = callable<ResolveVimeoInput, VimeoVideo>("resolveVimeoVideo");
export const callSaveMailSettings = callable<MailSettingsInput, SaveMailSettingsResult>(
  "saveMailSettings",
);
export const callDeleteMailSettings = callable<void, { ok: true }>("deleteMailSettings");
export const callSendTestMail = callable<void, { email: string }>("sendTestMail");
export const callSaveVimeoSettings = callable<
  VimeoSettingsInput,
  { name: string | null; account: string | null }
>("saveVimeoSettings");
export const callDeleteVimeoSettings = callable<void, { ok: true }>("deleteVimeoSettings");
export const callInviteSchoolAdmin = callable<
  InviteSchoolAdminInput,
  { uid: string; activation: boolean }
>("inviteSchoolAdmin");
export const callRemoveSchoolAdmin = callable<RemoveSchoolAdminInput, { ok: true }>(
  "removeSchoolAdmin",
);
export const callAddSchoolDomain = callable<SchoolDomainInput, SchoolDomain>("addSchoolDomain");
export const callRefreshSchoolDomain = callable<void, SchoolDomain>("refreshSchoolDomain");
export const callRemoveSchoolDomain = callable<void, { ok: true }>("removeSchoolDomain");
export const callApproveCreatorRequest = callable<ApproveCreatorRequestInput, { ok: true }>(
  "approveCreatorRequest",
);
export const callRejectCreatorRequest = callable<RejectCreatorRequestInput, { ok: true }>(
  "rejectCreatorRequest",
);
export const callConnectStripe = callable<void, { url: string }>("connectStripe");
export const callRefreshStripeStatus = callable<void, { chargesEnabled: boolean }>(
  "refreshStripeStatus",
);
export const callCreateCheckoutSession = callable<CreateCheckoutInput, { url: string }>(
  "createCheckoutSession",
);
export const callCreatePromoCode = callable<PromoCodeInput, { id: string }>("createPromoCode");
export const callCheckPromoCode = callable<CheckPromoInput, CheckedPromo>("checkPromoCode");
export const callSyncPromoCodes = callable<CourseIdInput, { ok: true }>("syncPromoCodes");
export const callDeactivatePromoCode = callable<PromoCodeIdInput, { ok: true }>(
  "deactivatePromoCode",
);
export const callUpdateSchoolProfile = callable<SchoolProfileInput, { ok: true }>(
  "updateSchoolProfile",
);
export const callSaveSchoolLegal = callable<SchoolLegalInput, { ok: true }>("saveSchoolLegal");
export const callIssueCertificate = callable<IssueCertificateInput, { id: string }>(
  "issueCertificate",
);
export const callSubmitQuiz = callable<SubmitQuizInput, QuizGrade>("submitQuiz");
export const callSaveWebhook = callable<WebhookInput, { id: string }>("saveWebhook");
export const callDeleteWebhook = callable<WebhookIdInput, { ok: true }>("deleteWebhook");
export const callTestWebhook = callable<WebhookIdInput, { status: number }>("testWebhook");
export const callSetCommunity = callable<SetCommunityInput, { ok: true }>("setCommunity");
export const callAskAssistant = callable<AskAssistantInput, AssistantAnswer>("askAssistant");
export const callSaveAssistantKey = callable<AssistantKeyInput, { keyLast4: string }>(
  "saveAssistantKey",
);
export const callDeleteAssistantKey = callable<Record<string, never>, { ok: true }>(
  "deleteAssistantKey",
);
export const callPlatformOverview = callable<Record<string, never>, PlatformOverview>(
  "platformOverview",
);
export const callPublishAnnouncement = callable<
  PublishAnnouncementInput,
  { id: string; recipients: number }
>("publishAnnouncement");
export const callIssueMissingInvoices = callable<{ schoolId?: string | null }, { issued: number }>(
  "issueMissingInvoices",
);
export const callSaveSalesSettings = callable<SalesSettingsInput, { ok: true }>(
  "saveSalesSettings",
);

export const callOpenConversation = callable<OpenConversationInput, { conversationId: string }>(
  "openConversation",
);
export const callUpdateConversation = callable<UpdateConversationInput, { ok: true }>(
  "updateConversation",
);

/** Message lisible pour une erreur Firebase (callable, auth, firestore). */
export function errorMessage(error: unknown): string {
  const code = (error as { code?: string }).code ?? "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/wrong-password": "Email ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet email.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
    "auth/weak-password": "Mot de passe trop faible (8 caractères minimum).",
    "auth/invalid-email": "Email invalide.",
    "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
    "auth/network-request-failed": "Connexion impossible. Vérifie ta connexion internet.",
    "permission-denied": "Action non autorisée.",
    "functions/permission-denied": "Action non autorisée.",
    "functions/unauthenticated": "Connexion requise.",
  };
  if (messages[code]) return messages[code];
  if (code.startsWith("functions/") && error instanceof Error) return error.message;
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}
