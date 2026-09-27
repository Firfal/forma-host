import { describe, expect, it } from "vitest";
import {
  certificateDuration,
  certificateEnabled,
  isCourseCompleted,
  issueCertificateInput,
} from "./certificates";
import type { OutlineItem } from "./types";

const items = [
  { id: "ch1", kind: "chapter", title: "Chapitre" },
  { id: "l1", kind: "lesson", title: "Leçon 1" },
  { id: "l2", kind: "lesson", title: "Leçon 2" },
  { id: "l3", kind: "lesson", title: "Cachée", hidden: true },
] as OutlineItem[];

describe("certificats", () => {
  it("délivrés par défaut, sauf désactivation", () => {
    expect(certificateEnabled({})).toBe(true);
    expect(certificateEnabled({ certificate: true })).toBe(true);
    expect(certificateEnabled({ certificate: false })).toBe(false);
  });

  it("formation terminée : toutes les leçons visibles", () => {
    expect(isCourseCompleted(items, ["l1"])).toBe(false);
    expect(isCourseCompleted(items, ["l1", "l2"])).toBe(true);
    expect(isCourseCompleted([], [])).toBe(false);
  });

  it("durée lisible", () => {
    expect(certificateDuration(30)).toBe("");
    expect(certificateDuration(45 * 60)).toBe("45 min de vidéo");
    expect(certificateDuration(3 * 3600 + 20 * 60)).toBe("3 h 20 de vidéo");
    expect(certificateDuration(2 * 3600)).toBe("2 h de vidéo");
  });

  it("nom imprimé requis", () => {
    expect(issueCertificateInput.safeParse({ courseId: "c1", name: " A " }).success).toBe(false);
    expect(issueCertificateInput.parse({ courseId: "c1", name: " Léa Martin " }).name).toBe(
      "Léa Martin",
    );
  });
});
