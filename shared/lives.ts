import { z } from "zod";

/**
 * Directs d'une formation (Zoom, Meet, Teams…) : date, lien de connexion, replay. Les élèves
 * inscrits les voient sur la page de la formation et les ajoutent à leur agenda (.ics).
 *
 * courses/{courseId}/lives/{liveId} : lu par l'équipe et les inscrits, écrit par l'équipe.
 */

export interface LiveDoc<T = unknown> {
  creatorId: string;
  courseId: string;
  title: string;
  description: string;
  startsAt: T;
  durationMin: number;
  joinUrl: string;
  replayUrl: string | null;
  createdAt: T;
  updatedAt: T;
}

/** Le lien s'active un peu avant l'heure, pour tester son micro. */
export const JOIN_EARLY_MIN = 15;
export const LIVE_DURATIONS = [30, 45, 60, 90, 120, 180] as const;

const httpUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(2000, "Lien trop long")
    .url(message)
    .refine((url) => /^https?:\/\//.test(url), message);

export const liveInput = z.object({
  title: z.string().trim().min(1, "Donne un titre au direct").max(120, "120 caractères maximum"),
  description: z.string().trim().max(2000, "2000 caractères maximum"),
  startsAt: z.date({ message: "Date et heure du direct" }),
  durationMin: z.number().int().min(15).max(480),
  joinUrl: httpUrl("Lien de connexion invalide (Zoom, Meet, Teams… commençant par https://)"),
});
export type LiveInput = z.infer<typeof liveInput>;

export const replayUrlSchema = httpUrl("Lien du replay invalide (https://…)");

export type LiveStatus = "upcoming" | "soon" | "live" | "ended";

export function liveStatus(startsAt: Date, durationMin: number, now = new Date()): LiveStatus {
  const start = startsAt.getTime();
  const end = start + durationMin * 60_000;
  const t = now.getTime();
  if (t >= end) return "ended";
  if (t >= start) return "live";
  if (t >= start - JOIN_EARLY_MIN * 60_000) return "soon";
  return "upcoming";
}

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});
const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** « jeudi 2 octobre à 19:00 » (heure de Paris). */
export function formatLiveDate(date: Date): string {
  return `${dayFormatter.format(date)} à ${timeFormatter.format(date)}`;
}

const icsDate = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Texte ICS : antislash, point-virgule, virgule et retours à la ligne échappés. */
const icsText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fichier agenda (.ics) d'un direct, lisible par Google Agenda, Outlook et Calendrier. */
export function buildIcs(live: {
  id: string;
  title: string;
  description: string;
  startsAt: Date;
  durationMin: number;
  joinUrl: string;
  courseTitle: string;
}): string {
  const end = new Date(live.startsAt.getTime() + live.durationMin * 60_000);
  const description = [live.description, `Rejoindre : ${live.joinUrl}`, live.courseTitle]
    .filter(Boolean)
    .join("\n\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forma Host//Directs//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${live.id}@forma-host`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(live.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(live.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    `URL:${live.joinUrl}`,
    `LOCATION:${icsText(live.joinUrl)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(live.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Directs à venir (les plus proches d'abord) puis passés (les plus récents d'abord). */
export function splitLives<T extends { start: Date; durationMin: number }>(
  lives: T[],
  now = new Date(),
): { upcoming: T[]; past: T[] } {
  const ended = (live: T) => liveStatus(live.start, live.durationMin, now) === "ended";
  return {
    upcoming: lives
      .filter((live) => !ended(live))
      .sort((a, b) => a.start.getTime() - b.start.getTime()),
    past: lives.filter(ended).sort((a, b) => b.start.getTime() - a.start.getTime()),
  };
}
