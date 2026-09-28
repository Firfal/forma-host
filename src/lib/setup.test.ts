import { describe, expect, it } from "vitest";
import type { OutlineItem } from "@shared/types";
import { setupSteps } from "./setup";

const lesson: OutlineItem = { id: "l1", kind: "lesson", title: "Bienvenue" };
const chapter: OutlineItem = { id: "c1", kind: "chapter", title: "Chapitre 1" };

describe("premiers pas", () => {
  it("nouvelle école : rien de fait, pas d'étape Stripe sans paiements", () => {
    const steps = setupSteps({
      logoUrl: null,
      courses: [],
      hasLegal: false,
      payments: { enabled: false, active: false },
      hasStudents: false,
    });
    expect(steps.map((s) => s.id)).toEqual([
      "school",
      "course",
      "lesson",
      "publish",
      "legal",
      "student",
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(steps.find((s) => s.id === "lesson")?.href).toBe("/admin/formations");
  });

  it("coche d'après les données et pointe vers la formation publiée", () => {
    const steps = setupSteps({
      logoUrl: "https://exemple.fr/logo.png",
      courses: [
        { id: "brouillon", status: "draft", items: [chapter] },
        { id: "ae", status: "published", items: [chapter, lesson] },
      ],
      hasLegal: true,
      payments: { enabled: true, active: false },
      hasStudents: false,
    });
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.school.done && byId.course.done && byId.lesson.done && byId.publish.done).toBe(
      true,
    );
    expect(byId.legal.done).toBe(true);
    expect(byId.payments.done).toBe(false);
    expect(byId.payments.href).toBe("/admin/parametres#paiements");
    expect(byId.student.href).toBe("/admin/formations/ae");
  });
});
