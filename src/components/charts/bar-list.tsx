import { cn } from "@/lib/cn";

export interface BarListRow {
  key: string;
  label: string;
  /** Pourcentage 0-100. */
  percent: number;
  detail?: string;
  highlight?: boolean;
}

/** Barres horizontales (une série, en %), libellé à gauche et valeur en bout de barre. */
export function BarList({ rows, title }: { rows: BarListRow[]; title: string }) {
  return (
    <ol className="space-y-1.5" aria-label={title}>
      {rows.map((row, index) => (
        <li
          key={row.key}
          className={cn(
            "grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3 rounded-md px-1.5 py-1 text-[13px] max-sm:grid-cols-1 max-sm:gap-1",
            row.highlight && "bg-warning-soft",
          )}
          title={row.detail}
        >
          <span className="truncate text-ink">
            <span className="mr-1.5 tabular-nums text-muted">{index + 1}.</span>
            {row.label}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 flex-1">
              <span
                className="block h-full rounded-r bg-chart"
                style={{ width: `${Math.max(row.percent, row.percent > 0 ? 1 : 0)}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-muted">
              {row.percent} %
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
