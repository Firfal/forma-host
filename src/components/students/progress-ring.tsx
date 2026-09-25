/** Petit anneau de progression (0 à 1), à côté de « 8 / 15 » comme dans la maquette. */
export function ProgressRing({ value, size = 16 }: { value: number; size?: number }) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="-rotate-90"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={stroke}
        strokeDasharray={clamped === 0 ? "2 2" : undefined}
      />
      {clamped > 0 ? (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={clamped >= 1 ? "var(--color-success)" : "var(--color-info)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${clamped * circumference} ${circumference}`}
        />
      ) : null}
    </svg>
  );
}
