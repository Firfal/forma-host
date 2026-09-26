import { FieldValue } from "firebase-admin/firestore";
import type { CreatorRequestDoc } from "@shared/creator-requests";
import { routes } from "@shared/paths";
import { emailLayout, escapeHtml } from "@shared/template";
import type { CreatorDoc } from "@shared/types";
import { db } from "./db";
import { brandFromCreator, mailDoc } from "./mail";
import { ensureSchoolOwner, isSlugTaken, SchoolError } from "./schools";

/**
 * Demandes d'espace formateur, validées par les administrateurs de la plateforme
 * (custom claim `platformAdmin`, liste dans platformAdmins/{uid}).
 * Les emails de la plateforme partent avec les réglages d'envoi de l'école de l'administrateur.
 */

export async function platformAdminUids(): Promise<string[]> {
  return (await db().collection("platformAdmins").get()).docs.map((doc) => doc.id);
}

function simpleEmail(input: {
  senderSchoolId: string;
  sender: CreatorDoc | undefined;
  to: string;
  subject: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
}) {
  const brand = brandFromCreator(input.sender);
  return mailDoc({
    creatorId: input.senderSchoolId,
    to: input.to,
    subject: input.subject,
    html: emailLayout({
      bodyHtml: input.paragraphs
        .map((text) => `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`)
        .join(""),
      ctaLabel: input.ctaLabel,
      ctaUrl: input.ctaUrl,
      brandName: brand.name,
      brandColor: brand.color,
    }),
    text: `${input.paragraphs.join("\n\n")}\n\n${input.ctaLabel} : ${input.ctaUrl}`,
    replyTo: brand.supportEmail,
  });
}

/** Nouvelle demande : notification (et email si possible) à chaque administrateur plateforme. */
export async function handleCreatorRequestCreated(
  request: CreatorRequestDoc,
  appUrl: string,
): Promise<void> {
  const admins = await platformAdminUids();
  if (admins.length === 0) return;
  const [users, schools] = await Promise.all([
    db().getAll(...admins.map((uid) => db().doc(`users/${uid}`))),
    db().getAll(...admins.map((uid) => db().doc(`creators/${uid}`))),
  ]);
  const batch = db().batch();
  admins.forEach((adminUid, index) => {
    batch.set(db().doc(`users/${adminUid}/notifications/creator_request_${request.uid}`), {
      type: "creator_request",
      title: "Nouvelle demande d'espace formateur",
      body: `${request.displayName} souhaite créer « ${request.schoolName} »`,
      link: routes.platformRequests,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const email = (users[index].data() as { email?: string } | undefined)?.email;
    const school = schools[index].data() as CreatorDoc | undefined;
    // Email seulement si l'administrateur a une école (réglages d'envoi).
    if (email && school) {
      batch.set(
        db().doc(`mail/creator_request_${request.uid}_${adminUid}`),
        simpleEmail({
          senderSchoolId: adminUid,
          sender: school,
          to: email,
          subject: `Demande d'espace formateur : ${request.schoolName}`,
          paragraphs: [
            `${request.displayName} (${request.email}) souhaite créer l'école « ${request.schoolName} ».`,
            request.message ? `Son message : ${request.message}` : "Aucun message.",
          ],
          ctaLabel: "Examiner la demande",
          ctaUrl: `${appUrl}${routes.platformRequests}`,
        }),
      );
    }
  });
  await batch.commit();
}

async function loadRequest(uid: string) {
  const ref = db().doc(`creatorRequests/${uid}`);
  const request = (await ref.get()).data() as CreatorRequestDoc | undefined;
  if (!request) throw new SchoolError("Demande introuvable.");
  if (request.status !== "pending") throw new SchoolError("Demande déjà traitée.");
  return { ref, request };
}

async function notifyDecision(params: {
  request: CreatorRequestDoc;
  deciderUid: string;
  approved: boolean;
  reason?: string | null;
  appUrl: string;
}) {
  const { request, approved } = params;
  const sender = (await db().doc(`creators/${params.deciderUid}`).get()).data() as
    CreatorDoc | undefined;
  const batch = db().batch();
  batch.set(db().doc(`users/${request.uid}/notifications/creator_request_decision`), {
    type: "creator_request_decision",
    title: approved ? "Ton espace formateur est prêt" : "Demande d'espace formateur refusée",
    body: approved
      ? `L'école « ${request.schoolName} » est créée.`
      : params.reason || "Ta demande n'a pas été retenue.",
    link: approved ? routes.admin : routes.becomeCreator,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  if (sender) {
    batch.set(
      db().doc(`mail/creator_request_decision_${request.uid}_${Date.now()}`),
      simpleEmail({
        senderSchoolId: params.deciderUid,
        sender,
        to: request.email,
        subject: approved
          ? `Ton école « ${request.schoolName} » est prête`
          : "Ta demande d'espace formateur",
        paragraphs: approved
          ? [
              `Bonne nouvelle : ton espace formateur « ${request.schoolName} » est créé.`,
              "Tu peux maintenant créer tes formations et inviter tes élèves.",
            ]
          : [
              "Ta demande d'espace formateur n'a pas été retenue pour le moment.",
              ...(params.reason ? [`Motif : ${params.reason}`] : []),
            ],
        ctaLabel: approved ? "Ouvrir mon espace formateur" : "Voir ma demande",
        ctaUrl: `${params.appUrl}${approved ? routes.admin : routes.becomeCreator}`,
      }),
    );
  }
  await batch.commit();
}

/** Accepte la demande : école créée (adresse unique), droits de propriétaire, notification. */
export async function approveCreatorRequest(params: {
  uid: string;
  slug: string;
  deciderUid: string;
  appUrl: string;
}): Promise<void> {
  const { ref, request } = await loadRequest(params.uid);
  const schoolRef = db().doc(`creators/${params.uid}`);
  await db().runTransaction(async (tx) => {
    if ((await tx.get(schoolRef)).exists) throw new SchoolError("Ce compte a déjà une école.");
    if (await isSlugTaken(tx, params.slug, null)) {
      throw new SchoolError(`L'adresse « ${params.slug} » est déjà prise : choisis-en une autre.`);
    }
    tx.create(schoolRef, {
      name: request.schoolName,
      slug: params.slug,
      previousSlugs: [],
      logoUrl: null,
      brandColor: "#9d72f9",
      supportEmail: request.email,
      adminUids: [params.uid],
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      status: "approved",
      slug: params.slug,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: params.deciderUid,
    });
  });
  await ensureSchoolOwner(params.uid);
  await notifyDecision({
    request,
    deciderUid: params.deciderUid,
    approved: true,
    appUrl: params.appUrl,
  });
}

export async function rejectCreatorRequest(params: {
  uid: string;
  reason: string | null;
  deciderUid: string;
  appUrl: string;
}): Promise<void> {
  const { ref, request } = await loadRequest(params.uid);
  await ref.update({
    status: "rejected",
    rejectionReason: params.reason,
    decidedAt: FieldValue.serverTimestamp(),
    decidedBy: params.deciderUid,
  });
  await notifyDecision({
    request,
    deciderUid: params.deciderUid,
    approved: false,
    reason: params.reason,
    appUrl: params.appUrl,
  });
}
