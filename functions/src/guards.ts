import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
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

export function requireAuth(request: CallableRequest): { uid: string; email: string | null } {
  if (!request.auth) throw new HttpsError("unauthenticated", "Connexion requise");
  return { uid: request.auth.uid, email: request.auth.token.email ?? null };
}

export function requireCreator(request: CallableRequest): { uid: string; email: string | null } {
  const caller = requireAuth(request);
  if (request.auth?.token.creator !== true) {
    throw new HttpsError("permission-denied", "Réservé aux formateurs");
  }
  return caller;
}

/** Charge la formation et vérifie que l'appelant en est le formateur. */
export async function requireCourseOwner(courseId: string, uid: string): Promise<CourseDoc> {
  const snap = await db().doc(`courses/${courseId}`).get();
  const course = snap.data() as CourseDoc | undefined;
  if (!course) throw new HttpsError("not-found", "Formation introuvable");
  if (course.creatorId !== uid)
    throw new HttpsError("permission-denied", "Formation d'un autre formateur");
  return course;
}
