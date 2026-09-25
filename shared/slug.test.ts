import { describe, expect, it } from "vitest";
import { isReservedSlug, isValidSlug, slugify } from "./slug";

describe("slug", () => {
  it("slugifie un titre français", () => {
    expect(slugify("Formation complète: Maîtriser After Effects de A à Z")).toBe(
      "formation-complete-maitriser-after-effects-de-a-a-z",
    );
    expect(slugify("  Motion & Design  ")).toBe("motion-et-design");
  });

  it("valide et réserve", () => {
    expect(isValidSlug("ecole-motion")).toBe(true);
    expect(isValidSlug("Ecole Motion")).toBe(false);
    expect(isValidSlug("-a")).toBe(false);
    expect(isReservedSlug("admin")).toBe(true);
    expect(isReservedSlug("ecole-motion")).toBe(false);
  });
});
