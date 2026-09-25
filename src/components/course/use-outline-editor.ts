"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { OutlineItem } from "@shared/types";
import { OutlineConflictError, saveOutline, type CourseWithId } from "@/lib/courses";
import { errorMessage } from "@/lib/firebase/callables";

interface OutlineState {
  items: OutlineItem[];
  version: number;
}

/**
 * Édition optimiste du plan : chaque modification s'affiche tout de suite et part dans une
 * file d'enregistrements séquentiels (chacun attend la version précédente + 1).
 * En cas d'échec ou de conflit, on revient à l'état du serveur.
 */
export function useOutlineEditor(course: CourseWithId) {
  const [state, setState] = useState<OutlineState>({
    items: course.items,
    version: course.outlineVersion,
  });
  const stateRef = useRef(state);
  const serverRef = useRef<OutlineState>({ items: course.items, version: course.outlineVersion });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const generation = useRef(0);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((next: OutlineState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Mises à jour venant du serveur (autre onglet, éditeur de leçon) : adoptées hors enregistrement.
  useEffect(() => {
    serverRef.current = { items: course.items, version: course.outlineVersion };
    if (pending.current === 0 && course.outlineVersion !== stateRef.current.version) {
      apply(serverRef.current);
    }
  }, [course.items, course.outlineVersion, apply]);

  const commit = useCallback(
    (update: (items: OutlineItem[]) => OutlineItem[]): Promise<boolean> => {
      const current = stateRef.current;
      const nextItems = update(current.items);
      if (nextItems === current.items) return Promise.resolve(true);
      apply({ items: nextItems, version: current.version + 1 });

      const gen = generation.current;
      pending.current += 1;
      setSaving(true);
      const run = queue.current.then(async () => {
        if (gen !== generation.current) return false;
        try {
          await saveOutline(course.id, current.version, nextItems);
          return true;
        } catch (error) {
          generation.current += 1;
          toast.error(error instanceof OutlineConflictError ? error.message : errorMessage(error));
          apply(serverRef.current);
          return false;
        } finally {
          pending.current -= 1;
          if (pending.current === 0) {
            setSaving(false);
            // Rattrape une modification faite ailleurs pendant l'enregistrement.
            if (serverRef.current.version > stateRef.current.version) apply(serverRef.current);
          }
        }
      });
      queue.current = run.then(() => undefined);
      return run;
    },
    [apply, course.id],
  );

  return { items: state.items, saving, commit };
}
