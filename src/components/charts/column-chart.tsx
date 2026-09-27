"use client";

import { useState } from "react";
import { niceMax } from "@shared/stats";
import { cn } from "@/lib/cn";

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
}

/**
 * Colonnes (une série) : barres fines arrondies en haut, axe à 0, graduations propres,
 * info-bulle au survol et au clavier, dernière valeur étiquetée, vue tableau.
 */
export function ColumnChart({
  data,
  format,
  title,
  valueLabel,
  integer = false,
  emptyText,
}: {
  data: ColumnDatum[];
  format: (value: number) => string;
  title: string;
  valueLabel: string;
  /** Valeurs entières (élèves…) : pas de graduation intermédiaire fractionnaire. */
  integer?: boolean;
  /** Message affiché à la place du graphique quand toutes les valeurs sont nulles. */
  emptyText?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((datum) => datum.value)));
  const ticks = [max, max / 2, 0].filter((tick) => !integer || Number.isInteger(tick));
  const last = data.length - 1;
  // Beaucoup de mois ou petit écran : un libellé sur deux.
  const sparseLabels = data.length > 12;

  if (emptyText && data.every((datum) => datum.value === 0)) {
    return (
      <p className="flex h-44 items-center justify-center rounded-md bg-surface text-[13px] text-muted">
        {emptyText}
      </p>
    );
  }

  return (
    <figure className="space-y-2">
      <div className="flex gap-2">
        <div className="flex h-44 flex-col justify-between pb-px text-right text-[11px] tabular-nums text-muted">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {format(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1" role="group" aria-label={title}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="pointer-events-none absolute inset-x-0 h-px bg-line-soft"
              style={{ bottom: `${(tick / max) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((datum, index) => {
              const height = datum.value > 0 ? Math.max(2, (datum.value / max) * 100) : 0;
              return (
                <button
                  key={datum.key}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  aria-label={`${datum.label} : ${format(datum.value)}`}
                >
                  <span
                    className={cn(
                      "w-full max-w-6 rounded-t bg-chart transition-opacity",
                      active !== null && active !== index && "opacity-60",
                      "group-focus-visible:ring-2 group-focus-visible:ring-ink/40",
                    )}
                    style={{ height: `${height}%` }}
                  />
                  {index === last && datum.value > 0 && active === null ? (
                    <span
                      className="pointer-events-none absolute whitespace-nowrap text-[11px] font-medium text-ink"
                      style={{ bottom: `calc(${height}% + 4px)` }}
                    >
                      {format(datum.value)}
                    </span>
                  ) : null}
                  {active === index ? (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-1.5 text-left shadow-sm"
                      style={{ bottom: `calc(${height}% + 8px)` }}
                    >
                      <span className="block text-sm font-semibold text-ink">
                        {format(datum.value)}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {valueLabel} · {datum.label}
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <span className="invisible text-[11px]">{format(max)}</span>
        <div className="flex flex-1">
          {data.map((datum, index) => (
            <span
              key={datum.key}
              className={cn(
                "flex-1 truncate text-center text-[11px] text-muted",
                index % 2 === 1 && (sparseLabels ? "invisible" : "max-sm:invisible"),
              )}
            >
              {datum.label}
            </span>
          ))}
        </div>
      </div>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-muted hover:text-ink">Voir le tableau</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="border-b border-line text-[12px] text-muted">
              <th className="py-1.5 font-medium">Mois</th>
              <th className="py-1.5 text-right font-medium">{valueLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key} className="border-b border-line-soft">
                <td className="py-1.5">{datum.label}</td>
                <td className="py-1.5 text-right tabular-nums">{format(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
