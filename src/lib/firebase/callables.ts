import { httpsCallable } from "firebase/functions";
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
import type { MailSettingsInput, SaveMailSettingsResult } from "@shared/mail-settings";
import type { SchoolProfileInput } from "@shared/school";
import type { VimeoVideo } from "@shared/types";
import { functions } from "./client";

function callable<I, O>(name: string) {
  const fn = httpsCallable<I, O>(functions, name);
  return async (input: I): Promise<O> => (await fn(input)).data;
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
export const callUpdateSchoolProfile = callable<SchoolProfileInput, { ok: true }>(
  "updateSchoolProfile",
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
