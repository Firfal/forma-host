import { describe, expect, it } from "vitest";
import {
  blockRange,
  insertAfter,
  insertInChapter,
  lessonsInChapter,
  moveItem,
  removeItem,
  updateItem,
} from "./outline-edit";
import type { OutlineItem } from "./types";

const c = (id: string): OutlineItem => ({ id, kind: "chapter", title: id });
const s = (id: string): OutlineItem => ({ id, kind: "subchapter", title: id });
const l = (id: string): OutlineItem => ({ id, kind: "lesson", title: id });
const ids = (items: OutlineItem[]) => items.map((item) => item.id).join(" ");

const plan = [l("x"), c("A"), l("a1"), s("As"), l("a2"), c("B"), l("b1"), c("C"), l("c1"), l("c2")];

describe("outline-edit", () => {
  it("calcule les blocs", () => {
    expect(blockRange(plan, 0)).toEqual([0, 1]);
    expect(blockRange(plan, 3)).toEqual([1, 5]);
    expect(blockRange(plan, 7)).toEqual([7, 10]);
  });

  it("déplace une leçon seule", () => {
    expect(ids(moveItem(plan, "c2", "a1"))).toBe("x A c2 a1 As a2 B b1 C c1");
  });

  it("déplace un chapitre avec son contenu", () => {
    expect(ids(moveItem(plan, "C", "B"))).toBe("x A a1 As a2 C c1 c2 B b1");
    expect(ids(moveItem(plan, "A", "b1"))).toBe("x B b1 A a1 As a2 C c1 c2");
    expect(ids(moveItem(plan, "A", "c2"))).toBe("x B b1 C c1 c2 A a1 As a2");
    expect(ids(moveItem(plan, "C", "x"))).toBe("C c1 c2 x A a1 As a2 B b1");
  });

  it("ignore un chapitre lâché sur son propre contenu", () => {
    expect(moveItem(plan, "A", "a2")).toBe(plan);
    expect(moveItem(plan, "inconnu", "a2")).toBe(plan);
  });

  it("insère à la fin d'un chapitre ou après un élément", () => {
    expect(ids(insertInChapter(plan, "A", l("new")))).toBe("x A a1 As a2 new B b1 C c1 c2");
    expect(ids(insertInChapter(plan, "C", l("new")))).toBe("x A a1 As a2 B b1 C c1 c2 new");
    expect(ids(insertInChapter(plan, null, c("D")))).toBe("x A a1 As a2 B b1 C c1 c2 D");
    expect(ids(insertAfter(plan, "b1", l("new")))).toBe("x A a1 As a2 B b1 new C c1 c2");
  });

  it("supprime un chapitre avec son contenu, un sous-chapitre seul", () => {
    expect(ids(removeItem(plan, "A"))).toBe("x B b1 C c1 c2");
    expect(ids(removeItem(plan, "As"))).toBe("x A a1 a2 B b1 C c1 c2");
    expect(ids(lessonsInChapter(plan, "A"))).toBe("a1 a2");
  });

  it("met à jour un élément", () => {
    expect(updateItem(plan, "b1", { isPreview: true })[6]).toEqual({ ...l("b1"), isPreview: true });
  });
});
