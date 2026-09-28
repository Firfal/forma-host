import { describe, expect, it } from "vitest";
import {
  askAssistantInput,
  assistantKeyInput,
  assistantSystemPrompt,
  courseContext,
  usageDay,
} from "./assistant";
import type { OutlineItem, RichText } from "./types";

const body = (text: string): RichText => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const items = [
  { id: "c1", kind: "chapter", title: "Les bases" },
  { id: "l1", kind: "lesson", title: "L'interface" },
  { id: "s1", kind: "subchapter", title: "Calques" },
  { id: "l2", kind: "lesson", title: 'Les "calques" de forme' },
  { id: "h", kind: "lesson", title: "Brouillon", hidden: true },
] as OutlineItem[];

describe("assistant IA", () => {
  it("contenu de la formation : plan et texte des leçons visibles", () => {
    const context = courseContext(items, [
      { id: "l1", body: body("Le panneau Composition est au centre.") },
      { id: "l2", body: null },
      { id: "h", body: body("Secret") },
    ]);
    expect(context).toContain("## Les bases");
    expect(context).toContain("### Calques");
    expect(context).toContain(
      '<lesson id="l1" title="L\'interface">\nLe panneau Composition est au centre.\n</lesson>',
    );
    expect(context).toContain(`<lesson id="l2" title="Les 'calques' de forme">`);
    expect(context).not.toContain("Secret");
  });

  it("consignes : formation, école et contenu encadré", () => {
    const prompt = assistantSystemPrompt({
      schoolName: "Ecole Motion",
      courseTitle: "After Effects",
      context: "CONTENU",
    });
    expect(prompt).toContain("« After Effects » de l'école Ecole Motion");
    expect(prompt).toContain("<formation>\nCONTENU\n</formation>");
  });

  it("valide questions et clés", () => {
    expect(askAssistantInput.parse({ courseId: "c", question: " Pourquoi ? " })).toMatchObject({
      question: "Pourquoi ?",
      history: [],
    });
    expect(askAssistantInput.safeParse({ courseId: "c", question: "x" }).success).toBe(false);
    expect(
      assistantKeyInput.safeParse({ apiKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz" }).success,
    ).toBe(true);
    expect(assistantKeyInput.safeParse({ apiKey: "sk-proj-123" }).success).toBe(false);
    expect(usageDay(new Date("2026-09-27T23:30:00Z"))).toBe("2026-09-27");
  });
});
