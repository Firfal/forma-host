"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/** Éditeur de texte enrichi (Tiptap, le plus gros morceau de la page) chargé après l'affichage. */
export const RichTextEditor = dynamic(
  () => import("./rich-text-editor").then((module) => module.RichTextEditor),
  { ssr: false, loading: () => <Skeleton className="h-[170px] w-full" /> },
);
