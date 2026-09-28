import { describe, expect, it } from "vitest";
import { buildIcs, formatLiveDate, liveStatus, splitLives } from "./lives";
import { liveInput } from "./lives-input";

const start = new Date("2026-10-01T17:00:00Z"); // 19:00 à Paris

describe("directs", () => {
  it("statut : à venir, bientôt (15 min avant), en cours, terminé", () => {
    const at = (iso: string) => liveStatus(start, 60, new Date(iso));
    expect(at("2026-10-01T16:00:00Z")).toBe("upcoming");
    expect(at("2026-10-01T16:50:00Z")).toBe("soon");
    expect(at("2026-10-01T17:30:00Z")).toBe("live");
    expect(at("2026-10-01T18:00:00Z")).toBe("ended");
  });

  it("date en heure de Paris", () => {
    expect(formatLiveDate(start)).toBe("jeudi 1 octobre à 19:00");
  });

  it("fichier agenda : dates UTC, texte échappé, rappel 15 min avant", () => {
    const ics = buildIcs({
      id: "l1",
      title: "Questions, réponses; bilan",
      description: "Préparez vos projets",
      startsAt: start,
      durationMin: 90,
      joinUrl: "https://meet.google.com/abc-defg-hij",
      courseTitle: "After Effects",
    });
    expect(ics).toContain("DTSTART:20261001T170000Z\r\n");
    expect(ics).toContain("DTEND:20261001T183000Z\r\n");
    expect(ics).toContain("SUMMARY:Questions\\, réponses\\; bilan\r\n");
    expect(ics).toContain(
      "DESCRIPTION:Préparez vos projets\\n\\nRejoindre : https://meet.google.com/abc-defg-hij",
    );
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("à venir d'abord (les plus proches), puis passés (les plus récents)", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    const live = (id: string, iso: string) => ({ id, start: new Date(iso), durationMin: 60 });
    const { upcoming, past } = splitLives(
      [
        live("tard", "2026-10-20T17:00:00Z"),
        live("vieux", "2026-09-01T17:00:00Z"),
        live("proche", "2026-10-11T17:00:00Z"),
        live("recent", "2026-10-05T17:00:00Z"),
      ],
      now,
    );
    expect(upcoming.map((l) => l.id)).toEqual(["proche", "tard"]);
    expect(past.map((l) => l.id)).toEqual(["recent", "vieux"]);
  });

  it("valide le direct", () => {
    const base = { title: "Direct", description: "", startsAt: start, durationMin: 60 };
    expect(liveInput.safeParse({ ...base, joinUrl: "https://zoom.us/j/123" }).success).toBe(true);
    expect(liveInput.safeParse({ ...base, joinUrl: "zoom.us/j/123" }).success).toBe(false);
    expect(liveInput.safeParse({ ...base, title: "", joinUrl: "https://x.fr" }).success).toBe(
      false,
    );
  });
});
