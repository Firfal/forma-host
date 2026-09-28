import { Fragment, createElement, type ReactNode } from "react";
import { sanitizeRichText } from "@shared/richtext";
import type { RichText as RichTextDoc } from "@shared/types";
import { cn } from "@/lib/cn";

/**
 * Rendu léger d'un document Tiptap (JSON) en éléments React, sans HTML brut ni Tiptap : les
 * pages élèves et publiques n'embarquent pas l'éditeur. Même balisage que le rendu Tiptap pour
 * les nœuds de l'éditeur (paragraphes, titres 2-3, listes, citations, sauts de ligne, gras,
 * italique, barré, souligné, liens) ; un nœud inconnu rend son contenu.
 */

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: Node[];
}

function renderText(node: Node, key: number): ReactNode {
  let element: ReactNode = node.text ?? "";
  // Première marque au plus près du texte, la dernière à l'extérieur (comme le rendu Tiptap).
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") element = createElement("strong", null, element);
    else if (mark.type === "italic") element = createElement("em", null, element);
    else if (mark.type === "strike") element = createElement("s", null, element);
    else if (mark.type === "underline") element = createElement("u", null, element);
    else if (mark.type === "link" && typeof mark.attrs?.href === "string") {
      element = createElement(
        "a",
        { target: "_blank", rel: "noopener noreferrer nofollow", href: mark.attrs.href },
        element,
      );
    }
  }
  return createElement(Fragment, { key }, element);
}

function renderNode(node: Node, key: number): ReactNode {
  const children = node.content?.map(renderNode);
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "paragraph":
      return createElement("p", { key }, children);
    case "heading": {
      const level = node.attrs?.level === 3 ? "h3" : "h2";
      return createElement(level, { key }, children);
    }
    case "bulletList":
      return createElement("ul", { key }, children);
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return createElement("ol", { key, start: start === 1 ? undefined : start }, children);
    }
    case "listItem":
      return createElement("li", { key }, children);
    case "blockquote":
      return createElement("blockquote", { key }, children);
    case "hardBreak":
      return createElement("br", { key });
    default:
      return createElement(Fragment, { key }, children);
  }
}

/** Éléments React d'un document (exporté pour les tests). */
export function renderRichText(doc: RichTextDoc | null | undefined): ReactNode {
  const clean = sanitizeRichText(doc) as Node | null;
  return clean?.content?.map(renderNode) ?? null;
}

/** Rendu d'un document Tiptap en éléments React (sans HTML brut). Serveur ou client. Sans JSX :
 * testable directement par Vitest. */
export function RichText({
  doc,
  className,
}: {
  doc: RichTextDoc | null | undefined;
  className?: string;
}) {
  const content = renderRichText(doc);
  if (!content) return null;
  return createElement("div", { className: cn("prose-forma", className) }, content);
}
