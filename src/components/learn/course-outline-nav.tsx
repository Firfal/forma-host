"use client";

import { CheckCircle2, ChevronDown, Lock, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDuration, groupByChapter } from "@shared/outline";
import { routes } from "@shared/paths";
import type { OutlineItem } from "@shared/types";
import { cn } from "@/lib/cn";

/** Plan de la formation côté élève : chapitres repliables, leçons terminées cochées. */
export function CourseOutlineNav({
  courseId,
  items,
  completedIds,
  activeLessonId,
  hasAccess,
  variant = "sidebar",
}: {
  courseId: string;
  items: OutlineItem[];
  completedIds: Set<string>;
  activeLessonId?: string;
  hasAccess: boolean;
  variant?: "sidebar" | "cards";
}) {
  const groups = groupByChapter(items);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <nav
      aria-label="Plan de la formation"
      className={cn(variant === "cards" ? "space-y-4" : "space-y-3")}
    >
      {groups.map((group) => {
        const groupId = group.chapter?.id ?? "intro";
        const isCollapsed = collapsed.has(groupId);
        return (
          <section
            key={groupId}
            className={cn(
              variant === "cards" && "rounded-card border border-line bg-white px-4 py-3",
            )}
          >
            {group.chapter ? (
              <button
                type="button"
                onClick={() => toggle(groupId)}
                aria-expanded={!isCollapsed}
                className={cn(
                  "flex w-full items-center gap-1.5 text-left font-semibold",
                  variant === "cards" ? "text-[15px]" : "px-2 py-1 text-[13px]",
                )}
              >
                <span className="flex-1">{group.chapter.title}</span>
                {variant === "cards" ? (
                  <span className="text-[12px] font-normal text-muted">
                    {group.lessonCount} leçon{group.lessonCount > 1 ? "s" : ""}
                  </span>
                ) : null}
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
            ) : null}
            {!isCollapsed ? (
              <ul className={cn("mt-1 space-y-0.5", variant === "cards" && "mt-2")}>
                {group.items.map((item) =>
                  item.kind === "subchapter" ? (
                    <li
                      key={item.id}
                      className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
                    >
                      {item.title}
                    </li>
                  ) : (
                    <li key={item.id}>
                      <LessonLink
                        courseId={courseId}
                        item={item}
                        done={completedIds.has(item.id)}
                        active={item.id === activeLessonId}
                        locked={!hasAccess && !item.isPreview}
                      />
                    </li>
                  ),
                )}
              </ul>
            ) : null}
          </section>
        );
      })}
    </nav>
  );
}

function LessonLink({
  courseId,
  item,
  done,
  active,
  locked,
}: {
  courseId: string;
  item: OutlineItem;
  done: boolean;
  active: boolean;
  locked: boolean;
}) {
  const Icon = locked ? Lock : done ? CheckCircle2 : PlayCircle;
  const content = (
    <>
      <Icon className={cn("size-4 shrink-0", done ? "text-success" : "text-muted")} />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      <span className="text-[11px] tabular-nums text-muted">
        {formatDuration(item.durationSec)}
      </span>
    </>
  );
  const className = cn(
    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
    active ? "bg-black/[0.07] font-medium" : "hover:bg-black/5",
    locked && "cursor-not-allowed opacity-60 hover:bg-transparent",
  );
  if (locked) {
    return (
      <span className={className} title="Réservé aux élèves inscrits">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={routes.lesson(courseId, item.id)}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {content}
    </Link>
  );
}
