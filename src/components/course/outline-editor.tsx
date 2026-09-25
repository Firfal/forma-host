"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Copy,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { formatDuration, groupByChapter, visibleLessons } from "@shared/outline";
import {
  insertInChapter,
  lessonsInChapter,
  moveItem,
  removeItem,
  updateItem,
} from "@shared/outline-edit";
import { routes } from "@shared/paths";
import type { OutlineItem } from "@shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { newId, type CourseWithId } from "@/lib/courses";
import { useOutlineEditor } from "./use-outline-editor";

type Commit = ReturnType<typeof useOutlineEditor>["commit"];

function useSortableRow(id: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return {
    rowProps: {
      ref: setNodeRef,
      style: { transform: CSS.Translate.toString(transform), transition },
      className: cn(isDragging && "relative z-10 rounded-md bg-white opacity-80 shadow-md"),
    },
    handle: (
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded p-1 text-muted/70 hover:bg-surface hover:text-ink active:cursor-grabbing"
        aria-label="Déplacer"
      >
        <GripVertical className="size-4" />
      </button>
    ),
  };
}

function InlineTitle({
  value,
  editing,
  onSubmit,
  onCancel,
  className,
}: {
  value: string;
  editing: boolean;
  onSubmit: (title: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  if (!editing) return <span className={cn("truncate", className)}>{value}</span>;
  const submit = () =>
    draft.trim() && draft.trim() !== value ? onSubmit(draft.trim()) : onCancel();
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submit();
    if (event.key === "Escape") onCancel();
  };
  return (
    <input
      autoFocus
      value={draft}
      maxLength={200}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={submit}
      onKeyDown={onKeyDown}
      onFocus={(event) => event.target.select()}
      className={cn(
        "min-w-0 flex-1 rounded border border-line bg-white px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-logo/25",
        className,
      )}
      aria-label="Titre"
    />
  );
}

function RowMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="subtle" size="icon" aria-label="Actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChapterHeader({
  item,
  items,
  commit,
  editing,
  setEditing,
  onAddLesson,
}: {
  item: OutlineItem;
  items: OutlineItem[];
  commit: Commit;
  editing: boolean;
  setEditing: (id: string | null) => void;
  onAddLesson: () => void;
}) {
  const { rowProps, handle } = useSortableRow(item.id);
  function addSubchapter() {
    const id = newId();
    void commit((current) =>
      insertInChapter(current, item.id, { id, kind: "subchapter", title: "Nouveau sous-chapitre" }),
    );
    setEditing(id);
  }
  function remove() {
    const count = lessonsInChapter(items, item.id).length;
    const message = count
      ? `Supprimer « ${item.title} » et ses ${count} leçon${count > 1 ? "s" : ""} (vidéos, commentaires inclus) ?`
      : `Supprimer le chapitre « ${item.title} » ?`;
    if (window.confirm(message)) void commit((current) => removeItem(current, item.id));
  }
  return (
    <div
      {...rowProps}
      className={cn("flex items-center gap-1.5 px-3 pb-2 pt-3", rowProps.className)}
    >
      {handle}
      <InlineTitle
        value={item.title}
        editing={editing}
        className="text-[15px] font-semibold"
        onSubmit={(title) => {
          setEditing(null);
          void commit((current) => updateItem(current, item.id, { title }));
        }}
        onCancel={() => setEditing(null)}
      />
      <span className="flex-1" />
      <RowMenu>
        <DropdownMenuItem onSelect={() => setEditing(item.id)}>
          <Pencil /> Renommer
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddLesson}>
          <Plus /> Ajouter une leçon
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={addSubchapter}>
          <FolderPlus /> Ajouter un sous-chapitre
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={remove}>
          <Trash2 /> Supprimer le chapitre…
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}

function SubchapterRow({
  item,
  commit,
  editing,
  setEditing,
}: {
  item: OutlineItem;
  commit: Commit;
  editing: boolean;
  setEditing: (id: string | null) => void;
}) {
  const { rowProps, handle } = useSortableRow(item.id);
  return (
    <div
      {...rowProps}
      className={cn("flex items-center gap-1.5 px-3 pb-1 pt-2.5", rowProps.className)}
    >
      {handle}
      <InlineTitle
        value={item.title}
        editing={editing}
        className="text-[13px] font-semibold uppercase tracking-wide text-muted"
        onSubmit={(title) => {
          setEditing(null);
          void commit((current) => updateItem(current, item.id, { title }));
        }}
        onCancel={() => setEditing(null)}
      />
      <span className="flex-1" />
      <RowMenu>
        <DropdownMenuItem onSelect={() => setEditing(item.id)}>
          <Pencil /> Renommer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          tone="danger"
          onSelect={() => void commit((current) => removeItem(current, item.id))}
        >
          <Trash2 /> Supprimer le sous-chapitre
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}

function LessonRow({
  item,
  courseId,
  commit,
}: {
  item: OutlineItem;
  courseId: string;
  commit: Commit;
}) {
  const { rowProps, handle } = useSortableRow(item.id);
  const editHref = routes.adminLesson(courseId, item.id);

  async function copyLink() {
    await navigator.clipboard.writeText(
      `${window.location.origin}${routes.lesson(courseId, item.id)}`,
    );
    toast.success("Lien de la leçon copié");
  }
  function remove() {
    if (window.confirm(`Supprimer la leçon « ${item.title} » ?`)) {
      void commit((current) => removeItem(current, item.id));
    }
  }

  return (
    <div
      {...rowProps}
      className={cn("group flex items-center gap-1.5 px-3 py-1", rowProps.className)}
    >
      {handle}
      <Link
        href={editHref}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-surface"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded bg-surface text-muted">
          <PlayCircle className="size-4" />
        </span>
        <span className={cn("truncate", item.hidden && "text-muted")}>{item.title}</span>
        {item.isPreview ? <Badge tone="info">Aperçu</Badge> : null}
        {item.hidden ? <Badge tone="warning">Masquée</Badge> : null}
        <span className="ml-auto pl-2 text-[12px] tabular-nums text-muted">
          {formatDuration(item.durationSec)}
        </span>
      </Link>
      <RowMenu>
        <DropdownMenuItem asChild>
          <Link href={editHref}>
            <Pencil /> Modifier
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.lesson(courseId, item.id)}>
            <Eye /> Voir la leçon
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyLink()}>
          <Copy /> Copier le lien
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            void commit((current) => updateItem(current, item.id, { isPreview: !item.isPreview }))
          }
        >
          <Unlock /> {item.isPreview ? "Désactiver l'aperçu gratuit" : "Activer l'aperçu gratuit"}
        </DropdownMenuItem>
        <DropdownMenuItem
          tone={item.hidden ? undefined : "warning"}
          onSelect={() =>
            void commit((current) => updateItem(current, item.id, { hidden: !item.hidden }))
          }
        >
          {item.hidden ? <Eye /> : <EyeOff />}{" "}
          {item.hidden ? "Afficher aux élèves" : "Masquer aux élèves"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" onSelect={remove}>
          <Trash2 /> Supprimer…
        </DropdownMenuItem>
      </RowMenu>
    </div>
  );
}

export function OutlineEditor({ course }: { course: CourseWithId }) {
  const router = useRouter();
  const { items, saving, commit } = useOutlineEditor(course);
  const [editingId, setEditingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const groups = groupByChapter(items, { includeHidden: true });

  /** chapterId à null : leçon placée avant le premier chapitre (« Hors chapitre »). */
  async function addLesson(chapterId: string | null) {
    const id = newId();
    const lesson: OutlineItem = { id, kind: "lesson", title: "Nouvelle leçon" };
    const saved = await commit((current) => {
      if (chapterId) return insertInChapter(current, chapterId, lesson);
      const firstChapter = current.findIndex((item) => item.kind === "chapter");
      return firstChapter === -1
        ? [...current, lesson]
        : [...current.slice(0, firstChapter), lesson, ...current.slice(firstChapter)];
    });
    if (saved) router.push(routes.adminLesson(course.id, id));
  }

  function addChapter() {
    const id = newId();
    void commit((current) => [...current, { id, kind: "chapter", title: "Nouveau chapitre" }]);
    setEditingId(id);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    void commit((current) => moveItem(current, String(active.id), String(over.id)));
  }

  const lessonCount = visibleLessons(items).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {lessonCount} leçon{lessonCount > 1 ? "s" : ""} visible{lessonCount > 1 ? "s" : ""} ·
          glisse-dépose pour réorganiser {saving ? "· Enregistrement…" : "· Enregistré"}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void addLesson(groups.at(-1)?.chapter?.id ?? null)}
          >
            <Plus /> Nouvelle leçon
          </Button>
          <Button variant="secondary" size="sm" onClick={addChapter}>
            <FolderPlus /> Nouveau chapitre
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<FolderPlus />}
          title="Commence par un chapitre"
          description="Organise ta formation en chapitres (et sous-chapitres si besoin), puis ajoute les leçons vidéo."
          action={
            <Button onClick={addChapter}>
              <FolderPlus /> Créer le premier chapitre
            </Button>
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {groups.map((group) => (
                <Card key={group.chapter?.id ?? "sans-chapitre"} className="pb-2">
                  {group.chapter ? (
                    <ChapterHeader
                      item={group.chapter}
                      items={items}
                      commit={commit}
                      editing={editingId === group.chapter.id}
                      setEditing={setEditingId}
                      onAddLesson={() => void addLesson(group.chapter!.id)}
                    />
                  ) : (
                    <p className="px-4 pb-1 pt-3 text-[13px] text-muted">Hors chapitre</p>
                  )}
                  {group.items.map((item) =>
                    item.kind === "subchapter" ? (
                      <SubchapterRow
                        key={item.id}
                        item={item}
                        commit={commit}
                        editing={editingId === item.id}
                        setEditing={setEditingId}
                      />
                    ) : (
                      <LessonRow key={item.id} item={item} courseId={course.id} commit={commit} />
                    ),
                  )}
                  <div className="px-3 pt-1">
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => void addLesson(group.chapter?.id ?? null)}
                      className="ml-7"
                    >
                      <Plus /> Nouvelle leçon
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
