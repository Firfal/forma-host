import { describe, expect, it } from "vitest";
import { noteExcerpt, noteId } from "./notes";

describe("notes de leçon", () => {
  it("identifiant formation_leçon", () => {
    expect(noteId("after-effects", "l3")).toBe("after-effects_l3");
  });

  it("extrait : première ligne utile, raccourcie", () => {
    expect(noteExcerpt("\n\n  Courbes : ease in / ease out  \nsuite")).toBe(
      "Courbes : ease in / ease out",
    );
    expect(noteExcerpt("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
    expect(noteExcerpt("   \n  ")).toBe("");
  });
});
