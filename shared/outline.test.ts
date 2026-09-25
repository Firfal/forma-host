import { describe, expect, it } from "vitest";
import {
  adjacentLessons,
  completedCount,
  formatDuration,
  groupByChapter,
  progressPercent,
  resumeLesson,
  validateOutline,
} from "./outline";
import type { OutlineItem } from "./types";

const items: OutlineItem[] = [
  { id: "c1", kind: "chapter", title: "Introduction" },
  { id: "l1", kind: "lesson", title: "Introduction à la formation" },
  { id: "c2", kind: "chapter", title: "Découverte du logiciel" },
  { id: "s1", kind: "subchapter", title: "L'interface" },
  { id: "l2", kind: "lesson", title: "Découverte de l'interface" },
  { id: "l3", kind: "lesson", title: "Leçon masquée", hidden: true },
  { id: "l4", kind: "lesson", title: "Votre première animation" },
];

describe("outline", () => {
  it("groupe par chapitre en ignorant les leçons masquées", () => {
    const groups = groupByChapter(items);
    expect(groups).toHaveLength(2);
    expect(groups[1].chapter?.id).toBe("c2");
    expect(groups[1].items.map((i) => i.id)).toEqual(["s1", "l2", "l4"]);
    expect(groups[1].lessonCount).toBe(2);
  });

  it("garde les leçons avant le premier chapitre", () => {
    const groups = groupByChapter([{ id: "x", kind: "lesson", title: "Seule" }, ...items]);
    expect(groups[0].chapter).toBeNull();
    expect(groups[0].items[0].id).toBe("x");
  });

  it("trouve la leçon précédente et suivante (hors masquées)", () => {
    expect(adjacentLessons(items, "l2")).toEqual({ prev: items[1], next: items[6] });
    expect(adjacentLessons(items, "l1").prev).toBeNull();
    expect(adjacentLessons(items, "inconnue")).toEqual({ prev: null, next: null });
  });

  it("calcule la progression sur les leçons visibles uniquement", () => {
    expect(completedCount(items, ["l1", "l3", "supprimée"])).toBe(1);
    expect(progressPercent(items, ["l1", "l2"])).toBe(67);
    expect(progressPercent([], [])).toBe(0);
  });

  it("reprend à la dernière leçon non terminée", () => {
    expect(resumeLesson(items, ["l1"], "l2")?.id).toBe("l2");
    expect(resumeLesson(items, ["l1", "l2"], "l2")?.id).toBe("l4");
    expect(resumeLesson(items, ["l1", "l2", "l4"], null)?.id).toBe("l1");
  });

  it("valide la structure", () => {
    expect(validateOutline(items)).toEqual([]);
    expect(validateOutline([{ id: "s", kind: "subchapter", title: "Orphelin" }])).toHaveLength(1);
    expect(
      validateOutline([
        { id: "a", kind: "lesson", title: "A" },
        { id: "a", kind: "lesson", title: " " },
      ]),
    ).toHaveLength(2);
  });

  it("formate les durées", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3725)).toBe("1 h 02");
  });
});
