/**
 * Communauté d'école : un fil de discussion réservé à l'équipe et aux élèves inscrits à au moins
 * une formation de l'école. Désactivée par défaut, activée par l'équipe.
 *
 * communities/{schoolId} : { enabled } (lisible par tous, écrit par les Functions)
 * communities/{schoolId}/people/{uid} : élèves membres, tenus à jour par les Functions
 * communities/{schoolId}/posts/{postId}(/replies/{replyId})
 */

export const COMMUNITY_LIMITS = { post: 5000, reply: 3000, feed: 50 } as const;

export interface CommunityDoc<T = unknown> {
  enabled: boolean;
  updatedAt: T;
}

export interface CommunityPersonDoc<T = unknown> {
  uid: string;
  joinedAt: T;
}

export interface CommunityPostDoc<T = unknown> {
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  pinned: boolean;
  /** Tenus à jour par les Functions. */
  replyCount: number;
  lastReplyAt: T | null;
  createdAt: T;
  editedAt?: T | null;
}

export interface CommunityReplyDoc<T = unknown> {
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: T;
}

/** Ouverture ou fermeture de la communauté d'une école (validation : community-input.ts). */
export interface SetCommunityInput {
  schoolId: string;
  enabled: boolean;
}

/** Fil : messages épinglés d'abord, puis du plus récent au plus ancien, sans doublon. */
export function sortFeed<T extends { id: string; pinned: boolean; at: number }>(
  pinned: T[],
  recent: T[],
): T[] {
  const seen = new Set<string>();
  const all = [...pinned.filter((p) => p.pinned), ...recent].filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
  return all.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
}
