/**
 * Types des documents Firestore, partagés entre l'app Next.js et les Cloud Functions.
 * Le type de timestamp est générique : le SDK web et l'Admin SDK ont chacun leur classe.
 */

import type { SchoolDomain } from "./domains";

export interface TimestampLike {
  toMillis(): number;
  toDate(): Date;
}

/** Document Tiptap (JSON). Rendu via @tiptap/static-renderer, jamais en HTML brut. */
export interface RichText {
  type: "doc";
  content?: unknown[];
}

export type CourseStatus = "draft" | "published";
export type CourseVisibility = "visible" | "hidden";
/** active : tout le monde commente ; restricted : les élèves lisent seulement ; hidden : masqués. */
export type CommentsMode = "active" | "restricted" | "hidden";

export type OutlineItemKind = "chapter" | "subchapter" | "lesson";

export interface OutlineItem {
  id: string;
  kind: OutlineItemKind;
  title: string;
  /** Leçon visible gratuitement (page de vente). */
  isPreview?: boolean;
  /** Leçon masquée aux élèves. */
  hidden?: boolean;
  durationSec?: number | null;
}

export interface SalesPageFaq {
  question: string;
  answer: string;
}

export interface SalesPageTestimonial {
  name: string;
  quote: string;
}

export interface SalesPage {
  announcement: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  aboutTitle: string;
  aboutText: string;
  testimonials: SalesPageTestimonial[];
  faq: SalesPageFaq[];
  priceLabel: string;
}

export interface CourseDoc<T = TimestampLike> {
  creatorId: string;
  title: string;
  slug: string;
  description: RichText | null;
  /** Résumé en texte brut (cartes, SEO). */
  summary: string;
  thumbnailUrl: string | null;
  status: CourseStatus;
  visibility: CourseVisibility;
  commentsMode: CommentsMode;
  items: OutlineItem[];
  outlineVersion: number;
  salesPage: SalesPage | null;
  createdAt: T;
  updatedAt: T;
}

export interface CoursePrivateSettings {
  welcomeEmail: { subject: string; body: string };
  /** Lien de paiement externe utilisé par le bouton de la page de vente (V1, sans Stripe). */
  externalCtaUrl: string | null;
}

export interface VimeoVideo {
  provider: "vimeo";
  id: string;
  hash: string | null;
  title: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
}

export interface LessonLink {
  label: string;
  url: string;
}

export interface LessonAttachment {
  name: string;
  path: string;
  size: number;
  contentType: string;
}

export interface LessonDoc<T = TimestampLike> {
  creatorId: string;
  courseId: string;
  /** Copie de course.status, pour les règles de sécurité. */
  courseStatus: CourseStatus;
  /** Copie de l'élément du plan, pour les règles de sécurité. */
  isPreview: boolean;
  title: string;
  video: VimeoVideo | null;
  /** Miniature personnalisée (remplace celle de Vimeo). */
  thumbnailUrl: string | null;
  body: RichText | null;
  links: LessonLink[];
  attachments: LessonAttachment[];
  updatedAt: T;
}

export type EnrollmentSource = "invite" | "import" | "stripe";
export type EnrollmentStatus = "active" | "revoked";

export interface EnrollmentProgress<T = TimestampLike> {
  completedLessonIds: string[];
  lastLessonId: string | null;
  lastActivityAt: T | null;
}

export interface EnrollmentDoc<T = TimestampLike> {
  courseId: string;
  creatorId: string;
  uid: string;
  email: string;
  displayName: string | null;
  source: EnrollmentSource;
  orderId: string | null;
  status: EnrollmentStatus;
  joinedAt: T;
  progress: EnrollmentProgress<T>;
}

export interface CommentDoc<T = TimestampLike> {
  courseId: string;
  creatorId: string;
  lessonId: string;
  authorUid: string;
  authorName: string;
  authorAvatarUrl: string | null;
  body: string;
  parentId: string | null;
  createdAt: T;
  editedAt?: T | null;
}

export type NotificationType = "new_student" | "new_comment" | "comment_reply";

export interface NotificationDoc<T = TimestampLike> {
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: T;
}

export interface InviteDoc<T = TimestampLike> {
  /** course : élève invité à une formation ; member : co-administrateur d'une école. */
  kind?: "course" | "member";
  uid: string;
  email: string;
  courseId: string | null;
  creatorId: string;
  expiresAt: T;
  usedAt: T | null;
  createdAt: T;
}

export interface CreatorDoc<T = TimestampLike> {
  name: string;
  slug: string;
  /** Anciennes adresses publiques, redirigées vers la nouvelle. */
  previousSlugs?: string[];
  /** Administrateurs de l'école (propriétaire inclus), tenus à jour par les Functions. */
  adminUids?: string[];
  /** Domaine personnalisé (Paramètres > Domaine), géré par les Functions. */
  customDomain?: SchoolDomain<T> | null;
  logoUrl: string | null;
  brandColor: string;
  supportEmail: string | null;
  createdAt: T;
}

export interface ProfileDoc<T = TimestampLike> {
  displayName: string;
  avatarUrl: string | null;
  createdAt: T;
}

export interface UserDoc<T = TimestampLike> {
  email: string;
  notifyOnComment: boolean;
  createdAt: T;
  /** Custom claims modifiés (écoles gérées) : le client recharge son jeton. */
  claimsUpdatedAt?: T;
}

/** Réglages d'envoi des emails du formateur (creators/{uid}/private/mail), écrits par les Functions. */
export interface MailSettingsDoc<T = TimestampLike> {
  provider: "brevo" | "gmail" | "smtp";
  host: string;
  port: number;
  username: string;
  fromName: string;
  fromEmail: string;
  updatedAt: T;
  lastSentAt: T | null;
  /** Dernier échec d'envoi, effacé au premier envoi réussi. */
  lastError: string | null;
  lastErrorAt: T | null;
}

/** NOT_CONFIGURED : en attente des réglages d'envoi du formateur. */
export type MailDeliveryState = "PROCESSING" | "SUCCESS" | "ERROR" | "NOT_CONFIGURED";

export interface MailDelivery<T = TimestampLike> {
  state: MailDeliveryState;
  attempts: number;
  error: string | null;
  messageId?: string | null;
  leaseExpireAt?: T | null;
  updatedAt: T;
}

/** Compte Vimeo relié à l'école (creators/{uid}/private/vimeo). Le token reste côté serveur. */
export interface VimeoSettingsDoc<T = TimestampLike> {
  accountName: string | null;
  /** Offre Vimeo : basic (gratuite), starter, standard, advanced, plus, pro… */
  account: string | null;
  updatedAt: T;
}

export type SchoolRole = "owner" | "admin";

/** Membre de l'équipe d'une école (creators/{schoolId}/members/{uid}). */
export interface SchoolMemberDoc<T = TimestampLike> {
  role: SchoolRole;
  email: string;
  displayName: string | null;
  addedAt: T;
}
