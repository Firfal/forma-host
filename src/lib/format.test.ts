import { describe, expect, it } from "vitest";
import { formatRelative, memberSeniority } from "./format";

const now = new Date("2026-06-19T12:00:00Z").getTime();

describe("format", () => {
  it("formate les durées relatives", () => {
    expect(formatRelative(new Date(now - 20_000), now)).toBe("à l'instant");
    expect(formatRelative(new Date(now - 5 * 60_000), now)).toBe("il y a 5 min");
    expect(formatRelative(new Date(now - 3 * 3_600_000), now)).toBe("il y a 3 h");
    expect(formatRelative(new Date(now - 2 * 86_400_000), now)).toBe("il y a 2 j");
    expect(formatRelative(null, now)).toBe("—");
  });

  it("calcule l'ancienneté affichée sur les badges", () => {
    expect(memberSeniority(new Date(now - 5 * 86_400_000), now)).toEqual({
      label: "Nouveau",
      isNew: true,
    });
    expect(memberSeniority(new Date(now - 95 * 86_400_000), now)).toEqual({
      label: "3 mois",
      isNew: false,
    });
    expect(memberSeniority(new Date(now - 400 * 86_400_000), now)).toEqual({
      label: "1 an",
      isNew: false,
    });
    expect(memberSeniority(new Date(now - 800 * 86_400_000), now)).toEqual({
      label: "2 ans",
      isNew: false,
    });
  });
});
