/** Analyse des liens Vimeo collés par le formateur (lien public, non répertorié, lecteur ou iframe). */

export interface VimeoRef {
  id: string;
  hash: string | null;
}

export function parseVimeoUrl(input: string): VimeoRef | null {
  let text = input.trim();
  // Code d'intégration <iframe src="…"> collé tel quel.
  const iframeSrc = text.match(/src=["']([^"']+)["']/i);
  if (iframeSrc) text = iframeSrc[1];
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text.replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const idIndex = segments.findIndex((segment) => /^\d{5,}$/.test(segment));
  if (idIndex === -1) return null;

  const id = segments[idIndex];
  const pathHash = segments[idIndex + 1];
  const hash =
    url.searchParams.get("h") ?? (pathHash && /^[0-9a-f]{6,}$/i.test(pathHash) ? pathHash : null);
  return { id, hash };
}

export function vimeoEmbedUrl(ref: VimeoRef): string {
  const params = new URLSearchParams({ dnt: "1" });
  if (ref.hash) params.set("h", ref.hash);
  return `https://player.vimeo.com/video/${ref.id}?${params.toString()}`;
}

export function vimeoPageUrl(ref: VimeoRef): string {
  return ref.hash ? `https://vimeo.com/${ref.id}/${ref.hash}` : `https://vimeo.com/${ref.id}`;
}
