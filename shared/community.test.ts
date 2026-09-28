import { describe, expect, it } from "vitest";
import { setCommunityInput, sortFeed } from "./community";

describe("communauté", () => {
  it("fil : épinglés d'abord, puis du plus récent au plus ancien, sans doublon", () => {
    const post = (id: string, at: number, pinned = false) => ({ id, at, pinned });
    const feed = sortFeed(
      [post("vieux", 1, true), post("recent-epingle", 5, true)],
      [post("c", 4), post("recent-epingle", 5, true), post("a", 2), post("b", 3)],
    );
    expect(feed.map((p) => p.id)).toEqual(["recent-epingle", "vieux", "c", "b", "a"]);
  });

  it("valide l'ouverture", () => {
    expect(setCommunityInput.safeParse({ schoolId: "theo", enabled: true }).success).toBe(true);
    expect(setCommunityInput.safeParse({ schoolId: "", enabled: true }).success).toBe(false);
  });
});
