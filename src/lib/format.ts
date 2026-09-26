import type { TimestampLike } from "@shared/types";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

/** Heure seule : « 17:17 ». */
export function formatTime(value: TimestampLike | Date | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : "—";
}

export function toDate(value: TimestampLike | Date | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export function formatDate(value: TimestampLike | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "—";
}

export function formatDateTime(value: TimestampLike | Date | null | undefined): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

/** « à l'instant », « il y a 3 h », « il y a 2 j », sinon la date. */
export function formatRelative(
  value: TimestampLike | Date | null | undefined,
  now = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return "—";
  const minutes = Math.round((now - date.getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return dateFormatter.format(date);
}

/** Ancienneté d'un membre : « Nouveau » (< 30 j), « 3 mois », « 1 an ». */
export function memberSeniority(
  joinedAt: TimestampLike | Date | null | undefined,
  now = Date.now(),
) {
  const date = toDate(joinedAt);
  if (!date) return { label: "Nouveau", isNew: true };
  const days = (now - date.getTime()) / 86_400_000;
  if (days < 30) return { label: "Nouveau", isNew: true };
  const months = Math.floor(days / 30.4);
  if (months < 12) return { label: `${months} mois`, isNew: false };
  const years = Math.floor(months / 12);
  return { label: `${years} an${years > 1 ? "s" : ""}`, isNew: false };
}
