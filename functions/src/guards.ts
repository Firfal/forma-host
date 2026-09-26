import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { schoolsFromClaims } from "@shared/school";
import type { CourseDoc } from "@shared/types";
import type { z } from "zod";
import { db } from "./db";

export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError(
      "invalid-argument",
      result.error.issues[0]?.message ?? "Données invalides",
    );
  }
  return result.data;
}

export interface Caller {
  uid: string;
  email: string | null;
  /** Écoles que l'appelant administre (custom claim `schools`). */
  schools: string[];
}

export function requireAuth(request: CallableRequest): Caller {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise");
  return {
    uid: request.auth.uid,
    email: request.auth.token.email ?? null,
    schools: schoolsFromClaims(request.auth.uid, request.auth.token),
  };
}

export function requireCreator(request: CallableRequest): Caller {
  const caller = requireAuth(request);
  if (request.auth?.token.creator !== true) {
    throw new HttpsError("permission-denied", "Réservé aux formateurs");
  }
  return caller;
}

/** Administrateur (propriétaire ou co-administrateur) de l'école. */
export function requireSchoolAdmin(request: CallableRequest, schoolId: string): Caller {
  const caller = requireCreator(request);
  if (!caller.schools.includes(schoolId)) {
    throw new HttpsError("permission-denied", "École d'un autre formateur");
  }
  return caller;
}

/** Réglages sensibles (équipe, emails, Vimeo, paiements) : propriétaire de l'école uniquement. */
export async function requireSchoolOwner(request: CallableRequest): Promise<Caller> {
  const caller = requireCreator(request);
  if (!(await db().doc(`creators/${caller.uid}`).get()).exists) {
    throw new HttpsError("permission-denied", "Réservé au propriétaire de l'école");
  }
  return caller;
}

/** Charge la formation et vérifie que l'appelant administre son école. */
export async function requireCourseAdmin(
  request: CallableRequest,
  courseId: string,
): Promise<{ caller: Caller; course: CourseDoc }> {
  const caller = requireCreator(request);
  const snap = await db().doc(`courses/${courseId}`).get();
  const course = snap.data() as CourseDoc | undefined;
  if (!course) throw new HttpsError("not-found", "Formation introuvable");
  if (!caller.schools.includes(course.creatorId))
    throw new HttpsError("permission-denied", "Formation d'un autre formateur");
  return { caller, course };
}

/** Administrateur de la plateforme (custom claim `platformAdmin`) : validation des formateurs. */
export function requirePlatformAdmin(request: CallableRequest): Caller {
  const caller = requireAuth(request);
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Réservé aux administrateurs de la plateforme");
  }
  return caller;
}
