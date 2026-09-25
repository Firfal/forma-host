import type { OutlineItem } from "./types";

/** Opérations pures sur le plan (liste plate). Un chapitre « possède » les éléments qui le suivent. */

/** Bornes [début, fin[ du bloc du chapitre (ou du bloc initial sans chapitre) contenant `index`. */
export function blockRange(items: OutlineItem[], index: number): [number, number] {
  let start = index;
  while (start > 0 && items[start].kind !== "chapter") start--;
  if (items[start]?.kind !== "chapter") start = 0;
  let end = index + 1;
  while (end < items.length && items[end].kind !== "chapter") end++;
  return [start, end];
}

function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Déplace `activeId` à la place de `overId`. Un chapitre se déplace avec tout son contenu,
 * avant ou après le bloc visé selon le sens du déplacement.
 */
export function moveItem(items: OutlineItem[], activeId: string, overId: string): OutlineItem[] {
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from === -1 || to === -1 || from === to) return items;
  if (items[from].kind !== "chapter") return arrayMove(items, from, to);

  const [start, end] = blockRange(items, from);
  if (to >= start && to < end) return items;
  const block = items.slice(start, end);
  const rest = [...items.slice(0, start), ...items.slice(end)];
  const overIndex = rest.findIndex((item) => item.id === overId);
  const [targetStart, targetEnd] = blockRange(rest, overIndex);
  const insertAt = to > from ? targetEnd : targetStart;
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

/** Ajoute un élément à la fin du bloc du chapitre `chapterId` (ou à la fin du plan). */
export function insertInChapter(
  items: OutlineItem[],
  chapterId: string | null,
  item: OutlineItem,
): OutlineItem[] {
  const index = chapterId ? items.findIndex((i) => i.id === chapterId) : -1;
  if (index === -1) return [...items, item];
  const [, end] = blockRange(items, index);
  return [...items.slice(0, end), item, ...items.slice(end)];
}

/** Insère juste après l'élément `afterId`. */
export function insertAfter(
  items: OutlineItem[],
  afterId: string,
  item: OutlineItem,
): OutlineItem[] {
  const index = items.findIndex((i) => i.id === afterId);
  if (index === -1) return [...items, item];
  return [...items.slice(0, index + 1), item, ...items.slice(index + 1)];
}

export function updateItem(
  items: OutlineItem[],
  id: string,
  patch: Partial<Omit<OutlineItem, "id" | "kind">>,
): OutlineItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/** Supprime un élément. Un chapitre est supprimé avec son contenu. */
export function removeItem(items: OutlineItem[], id: string): OutlineItem[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;
  if (items[index].kind !== "chapter") return items.filter((item) => item.id !== id);
  const [start, end] = blockRange(items, index);
  return [...items.slice(0, start), ...items.slice(end)];
}

/** Leçons contenues dans le bloc d'un chapitre. */
export function lessonsInChapter(items: OutlineItem[], chapterId: string): OutlineItem[] {
  const index = items.findIndex((item) => item.id === chapterId);
  if (index === -1) return [];
  const [start, end] = blockRange(items, index);
  return items.slice(start, end).filter((item) => item.kind === "lesson");
}
