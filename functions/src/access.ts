import { randomBytes } from "node:crypto";
import type { UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { INVITE_TTL_DAYS } from "@shared/constants";
import { schoolAdminSet } from "@shared/school";
import { enrollmentId, routes } from "@shared/paths";
import type { GrantAccessResult } from "@shared/schemas";
import type {
  CourseDoc,
  CoursePrivateSettings,
  CreatorDoc,
  EnrollmentDoc,
  EnrollmentSource,
  InviteDoc,
} from "@shared/types";
import { auth, db } from "./db";
import { brandFromCreator, buildWelcomeEmail, type Brand } from "./mail";

/**
 * Point d'entrée unique pour donner l'accès à une formation.
 * Utilisé par l'invitation, l'import CSV et, plus tard, le webhook de paiement.
 */

export interface StudentInput {
  email: string;
  name?: string;
  joinedAt?: string;
}

export interface GrantAccessParams {
  courseId: string;
  course: CourseDoc;
  students: StudentInput[];
  source: EnrollmentSource;
  sendEmail: boolean;
  appUrl: string;
  /** Achat Stripe (id de la session Checkout). */
  orderId?: string | null;
}

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Un compte pré-créé n'a pas encore de mot de passe (ni fournisseur de connexion). */
export function needsActivation(user: UserRecord): boolean {
  return user.providerData.length === 0 && !user.passwordHash;
}

export async function getOrCreateUser(email: string, name?: string): Promise<UserRecord> {
  try {
    return await auth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    return auth().createUser({ email, displayName: name || undefined });
  }
}

async function loadCourseContext(courseId: string, creatorId: string) {
  const [creatorSnap, settingsSnap] = await Promise.all([
    db().doc(`creators/${creatorId}`).get(),
    db().doc(`courses/${courseId}/private/settings`).get(),
  ]);
  const creator = creatorSnap.data() as CreatorDoc | undefined;
  return {
    brand: brandFromCreator(creator),
    settings: settingsSnap.data() as CoursePrivateSettings | undefined,
    admins: [...schoolAdminSet(creatorId, creator)],
  };
}

/** Crée les documents users/ et profiles/ s'ils n'existent pas encore. */
async function ensureUserDocs(tx: Transaction, user: UserRecord, name: string | undefined) {
  const userRef = db().doc(`users/${user.uid}`);
  const profileRef = db().doc(`profiles/${user.uid}`);
  const [userSnap, profileSnap] = await Promise.all([tx.get(userRef), tx.get(profileRef)]);
  return () => {
    if (!userSnap.exists) {
      tx.create(userRef, {
        email: user.email,
        notifyOnComment: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (!profileSnap.exists) {
      tx.create(profileRef, {
        displayName: name || user.displayName || (user.email ?? "").split("@")[0],
        avatarUrl: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  };
}

export function inviteDoc(
  uid: string,
  email: string,
  courseId: string | null,
  creatorId: string,
  kind: "course" | "member" = "course",
): InviteDoc<Timestamp> {
  const now = Date.now();
  return {
    kind,
    uid,
    email,
    courseId,
    creatorId,
    expiresAt: Timestamp.fromMillis(now + INVITE_TTL_DAYS * 24 * 3600 * 1000),
    usedAt: null,
    createdAt: Timestamp.fromMillis(now),
  };
}

type Outcome = "created" | "reactivated" | "alreadyEnrolled";

async function grantOne(
  params: GrantAccessParams,
  context: { brand: Brand; settings: CoursePrivateSettings | undefined; admins: string[] },
  student: StudentInput,
): Promise<Outcome> {
  const { courseId, course } = params;
  const user = await getOrCreateUser(student.email, student.name);
  const id = enrollmentId(courseId, user.uid);
  const enrollmentRef = db().doc(`enrollments/${id}`);
  const activation = needsActivation(user);

  return db().runTransaction(async (tx) => {
    const enrollmentSnap = await tx.get(enrollmentRef);
    const writeUserDocs = await ensureUserDocs(tx, user, student.name);
    const existing = enrollmentSnap.data() as EnrollmentDoc | undefined;
    if (existing?.status === "active") return "alreadyEnrolled";

    writeUserDocs();
    let outcome: Outcome;
    if (existing) {
      tx.update(enrollmentRef, { status: "active" });
      outcome = "reactivated";
    } else {
      const joinedAt = student.joinedAt
        ? Timestamp.fromDate(new Date(student.joinedAt))
        : FieldValue.serverTimestamp();
      tx.create(enrollmentRef, {
        courseId,
        creatorId: course.creatorId,
        uid: user.uid,
        email: student.email,
        displayName: student.name || user.displayName || null,
        source: params.source,
        orderId: params.orderId ?? null,
        status: "active",
        joinedAt,
        progress: { completedLessonIds: [], lastLessonId: null, lastActivityAt: null },
      });
      outcome = "created";
      // Pas de notification pour un import en masse (migration Podia).
      if (params.source !== "import") {
        for (const adminUid of context.admins) {
          tx.set(db().doc(`users/${adminUid}/notifications/student_${id}`), {
            type: "new_student",
            title: "Nouvel élève",
            body: `${student.name || student.email} a rejoint « ${course.title} »`,
            link: routes.adminCourse(courseId),
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }

    if (params.sendEmail) {
      let ctaUrl = `${params.appUrl}${routes.course(courseId)}`;
      if (activation) {
        const token = newInviteToken();
        tx.create(
          db().doc(`invites/${token}`),
          inviteDoc(user.uid, student.email, courseId, course.creatorId),
        );
        ctaUrl = `${params.appUrl}${routes.welcome(token)}`;
      }
      // ID déterministe : un déclencheur ou un appel rejoué n'envoie pas deux fois le mail.
      const mailId = outcome === "created" ? `welcome_${id}` : `welcome_${id}_${Date.now()}`;
      tx.create(
        db().doc(`mail/${mailId}`),
        buildWelcomeEmail({
          creatorId: course.creatorId,
          to: student.email,
          studentName: student.name || user.displayName || null,
          courseTitle: course.title,
          settings: context.settings,
          brand: context.brand,
          ctaUrl,
          activation,
        }),
      );
    }
    return outcome;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function grantAccessToStudents(params: GrantAccessParams): Promise<GrantAccessResult> {
  const context = await loadCourseContext(params.courseId, params.course.creatorId);
  // Dédoublonnage : un même email dans le CSV ne crée qu'une inscription.
  const unique = [...new Map(params.students.map((s) => [s.email, s])).values()];
  const results = await mapWithConcurrency(unique, 8, (student) =>
    grantOne(params, context, student),
  );

  const summary: GrantAccessResult = { created: 0, reactivated: 0, alreadyEnrolled: 0, errors: [] };
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      summary[result.value] += 1;
    } else {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      summary.errors.push({ email: unique[index].email, message });
    }
  });
  return summary;
}

/** Nouveau mail d'accès pour un élève déjà inscrit (lien d'activation si compte non activé). */
export async function resendAccessEmail(params: {
  courseId: string;
  course: CourseDoc;
  uid: string;
  appUrl: string;
}): Promise<void> {
  const { courseId, course, uid } = params;
  const id = enrollmentId(courseId, uid);
  const [enrollmentSnap, user, context] = await Promise.all([
    db().doc(`enrollments/${id}`).get(),
    auth().getUser(uid),
    loadCourseContext(courseId, course.creatorId),
  ]);
  const enrollment = enrollmentSnap.data() as EnrollmentDoc | undefined;
  if (!enrollment || enrollment.status !== "active") throw new Error("Inscription inactive");

  const activation = needsActivation(user);
  const batch = db().batch();
  let ctaUrl = `${params.appUrl}${routes.course(courseId)}`;
  if (activation) {
    const token = newInviteToken();
    batch.create(
      db().doc(`invites/${token}`),
      inviteDoc(uid, enrollment.email, courseId, course.creatorId),
    );
    ctaUrl = `${params.appUrl}${routes.welcome(token)}`;
  }
  batch.create(
    db().doc(`mail/resend_${id}_${Date.now()}`),
    buildWelcomeEmail({
      creatorId: course.creatorId,
      to: enrollment.email,
      studentName: enrollment.displayName,
      courseTitle: course.title,
      settings: context.settings,
      brand: context.brand,
      ctaUrl,
      activation,
    }),
  );
  await batch.commit();
}
