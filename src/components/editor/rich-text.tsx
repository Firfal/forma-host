import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { sanitizeRichText } from "@shared/richtext";
import type { RichText as RichTextDoc } from "@shared/types";
import { cn } from "@/lib/cn";
import { richTextExtensions } from "./extensions";

/** Rendu d'un document Tiptap en éléments React (sans HTML brut). Serveur ou client. */
export function RichText({
  doc,
  className,
}: {
  doc: RichTextDoc | null | undefined;
  className?: string;
}) {
  const clean = sanitizeRichText(doc);
  if (!clean) return null;
  return (
    <div className={cn("prose-forma", className)}>
      {renderToReactElement({ content: clean as never, extensions: richTextExtensions })}
    </div>
  );
}
