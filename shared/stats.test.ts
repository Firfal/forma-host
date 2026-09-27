import { describe, expect, it } from "vitest";
import {
  biggestDrop,
  courseStats,
  lastMonths,
  lessonFunnel,
  niceMax,
  sumByMonth,
  type StatsEnrollment,
} from "./stats";
import type { OutlineItem } from "./types";

const items = [
  { id: "l1", kind: "lesson", title: "Intro" },
  { id: "l2", kind: "lesson", title: "Bases" },
  { id: "l3", kind: "lesson", title: "Avancé" },
  { id: "l4", kind: "lesson", title: "Cachée", hidden: true },
] as OutlineItem[];

const enrollment = (uid: string, done: string[], extra: Partial<StatsEnrollment> = {}) => ({
  courseId: "c1",
  uid,
  status: "active",
  joinedAt: null,
  completedLessonIds: done,
  ...extra,
});

describe("statistiques", () => {
  it("12 derniers mois, du plus ancien au plus récent, année au changement", () => {
    const months = lastMonths(new Date(2026, 8, 27), 12);
    expect(months[0]).toEqual({ key: "2025-10", label: "oct" });
    expect(months.at(-1)?.key).toBe("2026-09");
    expect(months.find((month) => month.key === "2026-01")?.label).toBe("janv 26");
  });

  it("somme par mois, hors période ignorée", () => {
    const months = lastMonths(new Date(2026, 8, 27), 3);
    const orders = [
      { amount: 100, at: new Date(2026, 8, 2) },
      { amount: 50, at: new Date(2026, 8, 20) },
      { amount: 70, at: new Date(2026, 7, 5) },
      { amount: 999, at: new Date(2025, 0, 1) },
      { amount: 1, at: null },
    ];
    expect(
      sumByMonth(
        orders,
        months,
        (o) => o.at,
        (o) => o.amount,
      ).map((m) => m.value),
    ).toEqual([0, 70, 150]);
  });

  it("formation : élèves actifs, progression moyenne, terminés, certificats", () => {
    const stats = courseStats(items, [
      enrollment("a", ["l1", "l2", "l3"], { certificateId: "x" }),
      enrollment("b", ["l1"]),
      enrollment("c", ["l1", "l2", "l3"], { status: "revoked" }),
    ]);
    expect(stats).toEqual({ students: 2, averageProgress: 67, completed: 1, certificates: 1 });
  });

  it("décrochage par leçon et plus forte baisse", () => {
    const rows = lessonFunnel(items, [
      enrollment("a", ["l1", "l2", "l3"]),
      enrollment("b", ["l1", "l2"]),
      enrollment("c", ["l1"]),
      enrollment("d", []),
    ]);
    expect(rows.map((row) => row.percent)).toEqual([75, 50, 25]);
    expect(biggestDrop(rows)).toMatchObject({ from: { lessonId: "l1" }, drop: 25 });
    expect(biggestDrop([])).toBeNull();
  });

  it("axe : maximum arrondi", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(180)).toBe(200);
    expect(niceMax(2300)).toBe(2500);
    expect(niceMax(41000)).toBe(50000);
  });
});
