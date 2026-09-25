import { describe, expect, it } from "vitest";
import type { CommentDoc, CourseDoc, EnrollmentDoc } from "@shared/types";
import { buildActivity, dayLabel, groupByDay } from "./activity";

const ts = (iso: string) => ({
  toDate: () => new Date(iso),
  toMillis: () => new Date(iso).getTime(),
});

const course = {
  id: "c1",
  title: "After Effects",
  items: [{ id: "l1", kind: "lesson", title: "Interface" }],
} as unknown as CourseDoc & { id: string };

const enrollment = (id: string, joined: string, lastActivity: string | null) =>
  ({
    id,
    courseId: "c1",
    uid: id,
    email: `${id}@test.fr`,
    displayName: id === "anne" ? "Anne" : null,
    joinedAt: ts(joined),
    progress: {
      completedLessonIds: [],
      lastLessonId: lastActivity ? "l1" : null,
      lastActivityAt: lastActivity ? ts(lastActivity) : null,
    },
  }) as unknown as EnrollmentDoc & { id: string };

const comment = (id: string, author: string, at: string) =>
  ({
    id,
    courseId: "c1",
    lessonId: "l1",
    authorUid: author,
    authorName: author,
    body: "Question ?",
    createdAt: ts(at),
  }) as unknown as CommentDoc & {
    id: string;
  };

describe("buildActivity", () => {
  it("fusionne inscriptions, visionnages et commentaires (hors formateur), triés", () => {
    const events = buildActivity(
      [
        enrollment("anne", "2026-06-10T10:00:00Z", "2026-06-18T09:00:00Z"),
        enrollment("marc", "2026-06-17T08:00:00Z", null),
      ],
      [
        comment("k1", "anne", "2026-06-18T12:00:00Z"),
        comment("k2", "theo", "2026-06-18T13:00:00Z"),
      ],
      new Map([["c1", course]]),
      { creatorId: "theo" },
    );
    expect(events.map((e) => `${e.kind}:${e.who}`)).toEqual([
      "commented:anne",
      "watched:Anne",
      "joined:marc@test.fr",
      "joined:Anne",
    ]);
    expect(events[1].lessonTitle).toBe("Interface");
  });

  it("regroupe par jour", () => {
    const now = new Date("2026-06-19T15:00:00");
    expect(dayLabel(new Date("2026-06-19T08:00:00"), now)).toBe("Aujourd'hui");
    expect(dayLabel(new Date("2026-06-18T23:00:00"), now)).toBe("Hier");
    expect(dayLabel(new Date("2026-05-19T10:00:00"), now)).toBe("Mardi 19 mai");
    const groups = groupByDay(
      [
        { at: new Date("2026-06-19T10:00:00") },
        { at: new Date("2026-06-19T09:00:00") },
        { at: new Date("2026-06-17T09:00:00") },
      ] as never,
      now,
    );
    expect(groups.map((g) => [g.label, g.events.length])).toEqual([
      ["Aujourd'hui", 2],
      ["Mercredi 17 juin", 1],
    ]);
  });
});
