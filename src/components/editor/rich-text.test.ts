import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sanitizeRichText } from "@shared/richtext";
import type { RichText } from "@shared/types";
import { richTextExtensions } from "./extensions";
import { renderRichText } from "./rich-text";

const text = (value: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [text("Titre")] },
    { type: "heading", attrs: { level: 3 }, content: [text("Sous-titre")] },
    {
      type: "paragraph",
      content: [
        text("Du "),
        text("gras", [{ type: "bold" }]),
        text(", de l'"),
        text("italique", [{ type: "italic" }]),
        text(", "),
        text("les deux", [{ type: "bold" }, { type: "italic" }]),
        { type: "hardBreak" },
        text("un lien", [{ type: "link", attrs: { href: "https://discord.gg/x" } }]),
        text(", barré", [{ type: "strike" }]),
        text(", souligné", [{ type: "underline" }]),
        text(" et un faux lien", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]),
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [text("Un")] }] },
        { type: "listItem", content: [{ type: "paragraph", content: [text("Deux")] }] },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Trois")] }] }],
    },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [text("Citation")] }] },
    { type: "paragraph" },
  ],
} as RichText;

const html = (node: unknown) => renderToStaticMarkup(createElement(Fragment, null, node as never));

describe("rendu du texte enrichi", () => {
  it("même balisage que le rendu Tiptap, liens dangereux retirés", () => {
    const ours = html(renderRichText(doc));
    const tiptap = html(
      renderToReactElement({
        content: sanitizeRichText(doc) as never,
        extensions: richTextExtensions,
      }),
    );
    expect(ours).toBe(tiptap);
    expect(ours).not.toContain("javascript:");
  });

  it("document vide ou absent", () => {
    expect(renderRichText(null)).toBeNull();
    expect(html(renderRichText({ type: "doc" }))).toBe("");
  });
});
