import { describe, expect, it } from "vitest";
import { dripSchema, lessonLocks, lockLabel } from "./drip";
import type { OutlineItem } from "./types";

const items = [
  { id: "l0", kind: "lesson", title: "Bienvenue" },
  { id: "c1", kind: "chapter", title: "Chapitre 1" },
  { id: "l1", kind: "lesson", title: "Leçon 1" },
  { id: "l2", kind: "lesson", title: "Leçon 2" },
  { id: "h", kind: "lesson", title: "Cachée", hidden: true },
  { id: "c2", kind: "chapter", title: "Chapitre 2" },
  { id: "l3", kind: "lesson", title: "Leçon 3" },
] as OutlineItem[];

describe("ouverture progressive", () => {
  it("sans réglage : tout est ouvert", () => {
    expect(lessonLocks({ items, drip: null, joinedAt: null, completedLessonIds: [] }).size).toBe(0);
  });

  it("dans l'ordre : chaque leçon attend la précédente (déjà terminée : ouverte)", () => {
    const locks = lessonLocks({
      items,
      drip: { mode: "sequential" },
      joinedAt: null,
      completedLessonIds: ["l0", "l3"],
    });
    expect([...locks.keys()]).toEqual(["l2"]);
    expect(locks.get("l2")).toMatchObject({ reason: "sequential", previousTitle: "Leçon 1" });
    expect(lockLabel(locks.get("l2")!)).toBe("Termine « Leçon 1 » pour débloquer");
  });

  it("par dates : un chapitre tous les N jours après l'inscription", () => {
    const joinedAt = new Date(2026, 8, 1, 15, 0);
    const locks = lessonLocks({
      items,
      drip: { mode: "schedule", intervalDays: 7 },
      joinedAt,
      completedLessonIds: [],
      now: new Date(2026, 8, 9, 10, 0),
    });
    // Intro (chapitre 0) et chapitre 1 (8 sept.) ouverts, chapitre 2 le 15 sept.
    expect([...locks.keys()]).toEqual(["l3"]);
    expect(lockLabel(locks.get("l3")!)).toBe("Disponible le 15 septembre");
  });

  it("réglage validé", () => {
    expect(dripSchema.safeParse({ mode: "schedule", intervalDays: 0 }).success).toBe(false);
    expect(dripSchema.safeParse({ mode: "sequential" }).success).toBe(true);
  });
});
