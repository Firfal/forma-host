/** Écoles gérées d'après les custom claims (`schools`), plus la sienne pour un ancien jeton. */
export function schoolsFromClaims(uid: string, claims: Record<string, unknown>): string[] {
  const schools = Array.isArray(claims.schools)
    ? claims.schools.filter((id): id is string => typeof id === "string")
    : [];
  if (claims.creator === true && schools.length === 0) return [uid];
  return schools;
}

/** Administrateurs d'une école : propriétaire (schoolId) et co-administrateurs. */
export function schoolAdminSet(
  schoolId: string,
  creator: { adminUids?: string[] } | null | undefined,
): Set<string> {
  return new Set([schoolId, ...(creator?.adminUids ?? [])]);
}
