/**
 * Couleur d'une école sur ses pages publiques (vente, certificat) et dans ses emails, et
 * mesure de lisibilité (contraste WCAG AA de 4,5:1) pour conseiller le formateur.
 */

export const DEFAULT_BRAND_COLOR = "#5a0eb5";
const WHITE = "#ffffff";
const AA = 4.5;

const isHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminance relative (WCAG 2). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Teinte assombrie (ratio 0 : inchangée, 1 : noir). */
export function darken(hex: string, ratio: number): string {
  return toHex(rgb(hex).map((c) => c * (1 - ratio)) as [number, number, number]);
}

/** Première teinte, de plus en plus sombre, lisible sur du blanc (null au-delà de `max`). */
function readableShade(hex: string, max: number): string | null {
  for (let step = 0; step <= Math.round(max * 20); step += 1) {
    const shade = darken(hex, step / 20);
    if (contrastRatio(shade, WHITE) >= AA) return shade;
  }
  return null;
}

export interface BrandPalette {
  /** Fond des boutons et bandeaux. */
  brand: string;
  /** Texte posé sur `brand`. */
  ink: string;
  /** Texte de couleur sur fond blanc (liens, badges). */
  text: string;
}

/**
 * Couleur de l'école telle que choisie par le formateur (c'est son identité) : jamais modifiée.
 * Le texte des boutons reste blanc ; un conseil de lisibilité s'affiche dans ses paramètres.
 */
export function brandPalette(color: string | null | undefined): BrandPalette {
  const base = color && isHex(color) ? color.toLowerCase() : DEFAULT_BRAND_COLOR;
  return { brand: base, ink: WHITE, text: base };
}

/**
 * Conseil affiché au formateur quand le texte blanc est peu lisible sur sa couleur (sous 4,5:1) :
 * contraste actuel et teinte proche plus lisible. null : couleur lisible (ou invalide).
 */
export function brandContrastAdvice(
  color: string,
): { ratio: number; suggestion: string | null } | null {
  if (!isHex(color)) return null;
  const ratio = contrastRatio(color.toLowerCase(), WHITE);
  if (ratio >= AA) return null;
  return { ratio, suggestion: readableShade(color.toLowerCase(), 0.6) };
}

/** Variables CSS --brand, --brand-ink et --brand-text d'une page d'école. */
export function brandCssVars(color: string | null | undefined): Record<string, string> {
  const palette = brandPalette(color);
  return { "--brand": palette.brand, "--brand-ink": palette.ink, "--brand-text": palette.text };
}
