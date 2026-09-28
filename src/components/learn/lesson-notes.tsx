"use client";

import { ChevronDown, Lock, NotebookPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NOTE_MAX, NOTE_SAVE_DELAY } from "@shared/notes";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { saveLessonNote, useLessonNote } from "@/lib/notes";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const STATE_LABELS: Record<SaveState, string> = {
  idle: "",
  pending: "Modifications en cours…",
  saving: "Enregistrement…",
  saved: "Enregistré",
  error: "Non enregistré : vérifie ta connexion",
};

/** Notes personnelles de l'élève sous la leçon, enregistrées pendant la saisie. */
export function LessonNotes({
  uid,
  courseId,
  lessonId,
  lessonTitle,
}: {
  uid: string;
  courseId: string;
  lessonId: string;
  lessonTitle: string;
}) {
  const { data: note, loading } = useLessonNote(uid, courseId, lessonId);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  // Première lecture : note existante ouverte d'office.
  useEffect(() => {
    if (loading || text !== null) return;
    setText(note?.text ?? "");
    if (note?.text) setOpen(true);
  }, [loading, note, text]);

  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    setState("saving");
    try {
      await saveLessonNote(uid, { courseId, lessonId, lessonTitle, text: value });
      setState(pending.current === null ? "saved" : "pending");
    } catch {
      setState("error");
    }
  }

  // Changement de leçon ou départ de la page : dernière saisie enregistrée.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);

  function onChange(value: string) {
    setText(value);
    pending.current = value;
    setState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), NOTE_SAVE_DELAY);
  }

  return (
    <Card className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <NotebookPen className="size-4 text-muted" />
        <span className="flex-1 text-[14px] font-semibold">Mes notes</span>
        <span className="hidden items-center gap-1 text-[12px] text-muted sm:flex">
          <Lock className="size-3" /> Visibles par toi seul
        </span>
        <ChevronDown
          className={cn("size-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="space-y-1.5 border-t border-line-soft px-4 pb-3 pt-3">
          <Textarea
            aria-label="Mes notes sur cette leçon"
            value={text ?? ""}
            disabled={text === null}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => void flush()}
            maxLength={NOTE_MAX}
            rows={5}
            placeholder="Raccourcis, réglages, idées à retenir… Tu les retrouves sur la page de la formation."
          />
          <p
            className={cn("h-4 text-[12px] text-muted", state === "error" && "text-danger")}
            role="status"
          >
            {STATE_LABELS[state]}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
