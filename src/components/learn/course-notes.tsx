"use client";

import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { noteExcerpt } from "@shared/notes";
import { visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { OutlineItem } from "@shared/types";
import { Card } from "@/components/ui/card";
import { useCourseNotes } from "@/lib/notes";

/** « Mes notes » sur la page de la formation, dans l'ordre du plan. */
export function CourseNotes({
  uid,
  courseId,
  items,
}: {
  uid: string;
  courseId: string;
  items: OutlineItem[];
}) {
  const { data: notes } = useCourseNotes(uid, courseId);
  const sorted = useMemo(() => {
    const order = new Map(visibleLessons(items).map((lesson, index) => [lesson.id, index]));
    const titles = new Map(items.map((item) => [item.id, item.title]));
    return notes
      .filter((note) => note.text.trim())
      .map((note) => ({ ...note, title: titles.get(note.lessonId) ?? note.lessonTitle }))
      .sort(
        (a, b) =>
          (order.get(a.lessonId) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(b.lessonId) ?? Number.MAX_SAFE_INTEGER),
      );
  }, [notes, items]);
  if (!sorted.length) return null;

  return (
    <section aria-labelledby="notes-title" className="space-y-3">
      <h2 id="notes-title" className="flex items-center gap-2 font-semibold">
        <NotebookPen className="size-4 text-muted" /> Mes notes
      </h2>
      <Card className="divide-y divide-line-soft">
        {sorted.map((note) => (
          <Link
            key={note.id}
            href={routes.lesson(courseId, note.lessonId)}
            className="block px-4 py-2.5 hover:bg-surface/60"
          >
            <span className="block text-[14px] font-medium">{note.title}</span>
            <span className="block truncate text-[13px] text-muted">{noteExcerpt(note.text)}</span>
          </Link>
        ))}
      </Card>
    </section>
  );
}
