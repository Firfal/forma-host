"use client";

import { ChevronDown, Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ASSISTANT_QUESTION_MAX, type AssistantTurn } from "@shared/assistant";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { callAskAssistant, errorMessage } from "@/lib/firebase/callables";

const SUGGESTIONS = [
  "Peux-tu me résumer cette leçon ?",
  "Je n'ai pas compris une étape, peux-tu l'expliquer autrement ?",
  "Quels sont les points clés à retenir ?",
];

/**
 * Assistant IA sous la leçon : questions sur la formation, réponses tirées de son contenu.
 * La conversation reste dans la page (rien n'est enregistré).
 */
export function LessonAssistant({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [turns, pending]);

  async function ask(text = question) {
    const clean = text.trim();
    if (!clean || pending) return;
    setError(null);
    setPending(true);
    setQuestion("");
    const history = turns;
    setTurns([...history, { role: "user", content: clean }]);
    try {
      const result = await callAskAssistant({ courseId, lessonId, question: clean, history });
      setTurns([
        ...history,
        { role: "user", content: clean },
        { role: "assistant", content: result.answer },
      ]);
      setRemaining(result.remaining);
    } catch (err) {
      setTurns(history);
      setQuestion(clean);
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-6 rounded-card border border-line bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
          <Sparkles className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold">Assistant de la formation</span>
          <span className="block text-[13px] text-muted">
            Une question sur la leçon ? L&apos;assistant répond à partir du contenu de la formation.
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-line-soft px-4 pb-4 pt-3 sm:px-5">
          {turns.length === 0 && !pending ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void ask(suggestion)}
                  className="rounded-full border border-line px-3 py-1 text-[13px] text-muted hover:bg-surface hover:text-ink"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={cn(
                    "whitespace-pre-line rounded-md px-3 py-2 text-[14px] leading-6",
                    turn.role === "user" ? "ml-8 bg-surface" : "mr-8 border border-line-soft",
                  )}
                >
                  {turn.content}
                </div>
              ))}
              {pending ? (
                <p className="mr-8 flex items-center gap-2 px-3 py-2 text-[13px] text-muted">
                  <Loader2 className="size-4 animate-spin" /> L&apos;assistant réfléchit…
                </p>
              ) : null}
              <div ref={end} />
            </div>
          )}

          {error ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
          ) : null}

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <Textarea
              aria-label="Ta question à l'assistant"
              placeholder="Pose ta question…"
              className="min-h-11 flex-1 resize-none"
              rows={1}
              maxLength={ASSISTANT_QUESTION_MAX}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Envoyer la question"
              disabled={!question.trim() || pending}
            >
              <Send />
            </Button>
          </form>
          <p className="text-[12px] text-muted">
            Réponses générées par IA : elles peuvent contenir des erreurs. Pour une question sur
            l&apos;école, écris au formateur.
            {remaining !== null
              ? ` ${remaining} question${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""} aujourd'hui.`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
