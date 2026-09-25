import { describe, expect, it } from "vitest";
import { richTextToPlain, sanitizeRichText } from "./richtext";
import type { RichText } from "./types";

const doc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Rejoins le " },
        {
          type: "text",
          text: "Discord",
          marks: [{ type: "link", attrs: { href: "https://discord.gg/x" } }],
        },
        { type: "text", text: " et " },
        {
          type: "text",
          text: "clique",
          marks: [{ type: "bold" }, { type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
    { type: "paragraph", content: [{ type: "text", text: "Deuxième paragraphe." }] },
  ],
} as RichText;

describe("richtext", () => {
  it("retire les liens dangereux et garde les autres marques", () => {
    const clean = sanitizeRichText(doc) as unknown as {
      content: { content: { marks?: { type: string }[] }[] }[];
    };
    expect(clean.content[0].content[1].marks).toEqual([
      { type: "link", attrs: { href: "https://discord.gg/x" } },
    ]);
    expect(clean.content[0].content[3].marks).toEqual([{ type: "bold" }]);
  });

  it("refuse un document invalide", () => {
    expect(sanitizeRichText(null)).toBeNull();
    expect(sanitizeRichText({ type: "paragraph" } as unknown as RichText)).toBeNull();
  });

  it("extrait le texte brut", () => {
    expect(richTextToPlain(doc)).toBe("Rejoins le Discord et clique Deuxième paragraphe.");
    expect(richTextToPlain(doc, 12)).toBe("Rejoins le…");
    expect(richTextToPlain(null)).toBe("");
  });
});
