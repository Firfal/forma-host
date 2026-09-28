"use client";

import { Check, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProgressBar } from "@/components/learn/progress-bar";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { SetupStep } from "@/lib/setup";

const hiddenKey = (schoolId: string) => `forma:premiers-pas-masques:${schoolId}`;

/** « Premiers pas » masqués par le formateur (mémorisé sur cet appareil). */
export function useSetupHidden(schoolId: string | null | undefined): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!schoolId) return;
    try {
      setHidden(window.localStorage.getItem(hiddenKey(schoolId)) === "1");
    } catch {
      setHidden(false);
    }
  }, [schoolId]);
  const hide = useCallback(() => {
    setHidden(true);
    if (!schoolId) return;
    try {
      window.localStorage.setItem(hiddenKey(schoolId), "1");
    } catch {
      // Stockage indisponible (navigation privée) : masqué pour cette visite seulement.
    }
  }, [schoolId]);
  return [hidden, hide];
}

/** Étapes pour ouvrir son école, cochées au fur et à mesure. */
export function SetupCard({ steps, onHide }: { steps: SetupStep[]; onHide: () => void }) {
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <div className="min-w-0 flex-1 space-y-2">
          <CardTitle>Premiers pas</CardTitle>
          <div className="flex items-center gap-3">
            <ProgressBar percent={Math.round((done / steps.length) * 100)} className="max-w-48" />
            <span className="shrink-0 text-[12px] text-muted">
              {done} sur {steps.length}
            </span>
          </div>
        </div>
        <Button variant="subtle" size="icon" aria-label="Masquer les premiers pas" onClick={onHide}>
          <X />
        </Button>
      </CardHeader>
      <ol className="divide-y divide-line-soft border-t border-line-soft">
        {steps.map((step) => (
          <li key={step.id}>
            {step.done ? (
              <div className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-muted">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-3" />
                </span>
                <span className="flex-1 line-through decoration-line">{step.label}</span>
              </div>
            ) : (
              <Link
                href={step.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface/60",
                  step === next && "bg-brand-soft/40",
                )}
              >
                <span className="size-5 shrink-0 rounded-full border-2 border-line" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{step.label}</span>
                  <span className="block text-[12px] text-muted">{step.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
