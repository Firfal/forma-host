import "server-only";
import type { CreatorDoc } from "@shared/types";
import { adminDb } from "./firebase/admin";

/**
 * Domaine personnalisé → adresse publique (slug) de l'école. Utilisé par le middleware à chaque
 * requête : les réponses sont gardées 60 s en mémoire (y compris « aucun domaine »).
 */

const TTL_MS = 60_000;
const cache = new Map<string, { slug: string | null; expires: number }>();

export async function schoolSlugForHost(host: string): Promise<string | null> {
  const cached = cache.get(host);
  if (cached && cached.expires > Date.now()) return cached.slug;
  let slug: string | null = null;
  try {
    const domain = (await adminDb.doc(`domains/${host}`).get()).data() as
      { schoolId: string; status: string } | undefined;
    if (domain?.status === "active") {
      const creator = (await adminDb.doc(`creators/${domain.schoolId}`).get()).data() as
        CreatorDoc | undefined;
      slug = creator?.slug ?? null;
    }
  } catch (error) {
    console.error("schoolSlugForHost", error);
  }
  cache.set(host, { slug, expires: Date.now() + TTL_MS });
  return slug;
}
