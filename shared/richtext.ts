import type { RichText } from "./types";

interface JsonNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
}

const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

/** Retire les liens non http(s)/mailto (ex. javascript:) d'un document Tiptap. */
export function sanitizeRichText(doc: RichText | null | undefined): RichText | null {
  if (!doc || doc.type !== "doc") return null;
  const clean = (node: JsonNode): JsonNode => {
    const next: JsonNode = { ...node };
    if (node.marks) {
      next.marks = node.marks.filter((mark) => {
        if (mark.type !== "link") return true;
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href.trim() : "";
        return SAFE_HREF.test(href);
      });
    }
    if (node.content) next.content = node.content.map(clean);
    return next;
  };
  return clean(doc as JsonNode) as RichText;
}

/** Texte brut d'un document Tiptap (résumés, SEO). */
export function richTextToPlain(doc: RichText | null | undefined, maxLength = Infinity): string {
  if (!doc) return "";
  const blocks: string[] = [];
  const walk = (node: JsonNode, acc: string[]) => {
    if (node.type === "text" && node.text) acc.push(node.text);
    node.content?.forEach((child) => walk(child, acc));
  };
  (doc as JsonNode).content?.forEach((block) => {
    const acc: string[] = [];
    walk(block, acc);
    if (acc.length) blocks.push(acc.join(""));
  });
  const text = blocks.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function isRichTextEmpty(doc: RichText | null | undefined): boolean {
  return richTextToPlain(doc).length === 0;
}
