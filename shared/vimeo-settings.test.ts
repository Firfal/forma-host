import { describe, expect, it } from "vitest";
import { isFreeVimeoAccount, vimeoAccountLabel, vimeoSettingsInput } from "./vimeo-settings";

describe("vimeoSettingsInput", () => {
  it("accepte un token et retire les espaces autour", () => {
    expect(vimeoSettingsInput.parse({ token: "  a1b2c3d4e5f6a7b8c9d0e1f2  " }).token).toBe(
      "a1b2c3d4e5f6a7b8c9d0e1f2",
    );
  });

  it("refuse un token tronqué ou avec des caractères inattendus", () => {
    expect(vimeoSettingsInput.safeParse({ token: "abc" }).success).toBe(false);
    expect(vimeoSettingsInput.safeParse({ token: "bearer a1b2c3d4e5f6a7b8c9d0" }).success).toBe(
      false,
    );
  });
});

describe("offre Vimeo", () => {
  it("reconnaît l'offre gratuite", () => {
    expect(isFreeVimeoAccount("basic")).toBe(true);
    expect(isFreeVimeoAccount("starter")).toBe(false);
    expect(vimeoAccountLabel("basic")).toBe("gratuite");
    expect(vimeoAccountLabel("live_business")).toBe("Live Business");
    expect(vimeoAccountLabel(null)).toBe("inconnue");
  });
});
