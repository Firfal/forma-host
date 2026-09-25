import { parseVimeoUrl, vimeoPageUrl, type VimeoRef } from "@shared/vimeo";
import type { VimeoVideo } from "@shared/types";

interface VimeoApiVideo {
  name?: string;
  duration?: number;
  pictures?: { base_link?: string; sizes?: { width: number; link: string }[] };
}

interface VimeoOEmbed {
  title?: string;
  duration?: number;
  thumbnail_url?: string;
}

export function pickThumbnail(pictures: VimeoApiVideo["pictures"]): string | null {
  const sizes = [...(pictures?.sizes ?? [])].sort((a, b) => a.width - b.width);
  const large = sizes.find((size) => size.width >= 960) ?? sizes.at(-1);
  return large?.link ?? pictures?.base_link ?? null;
}

export function fromApi(ref: VimeoRef, body: VimeoApiVideo): VimeoVideo {
  return {
    provider: "vimeo",
    id: ref.id,
    hash: ref.hash,
    title: body.name ?? null,
    durationSec: typeof body.duration === "number" ? body.duration : null,
    thumbnailUrl: pickThumbnail(body.pictures),
  };
}

export function fromOEmbed(ref: VimeoRef, body: VimeoOEmbed): VimeoVideo {
  return {
    provider: "vimeo",
    id: ref.id,
    hash: ref.hash,
    title: body.title ?? null,
    durationSec: typeof body.duration === "number" ? body.duration : null,
    // Miniature oEmbed redimensionnée par Vimeo (suffixe _WxH) : on demande une taille HD.
    thumbnailUrl: body.thumbnail_url?.replace(/_\d+x\d+(\.\w+)?$/, "_1280x720$1") ?? null,
  };
}

/**
 * Récupère titre, durée et miniature. Avec un token API (compte du formateur), fonctionne
 * pour les vidéos privées ; sinon oEmbed, avec le Referer du domaine autorisé.
 */
export async function resolveVimeo(
  url: string,
  token: string | null,
  appUrl: string,
): Promise<VimeoVideo> {
  const ref = parseVimeoUrl(url);
  if (!ref) throw new Error("Lien Vimeo non reconnu");

  // Sans token valide (secret « unset », token révoqué…), on passe par oEmbed.
  if (token && token !== "unset") {
    const response = await fetch(
      `https://api.vimeo.com/videos/${ref.id}?fields=name,duration,pictures`,
      {
        headers: {
          Authorization: `bearer ${token}`,
          Accept: "application/vnd.vimeo.*+json;version=3.4",
        },
      },
    );
    if (response.ok) return fromApi(ref, (await response.json()) as VimeoApiVideo);
  }

  const oembed = new URL("https://vimeo.com/api/oembed.json");
  oembed.searchParams.set("url", vimeoPageUrl(ref));
  const response = await fetch(oembed, { headers: { Referer: appUrl } });
  if (!response.ok) {
    throw new Error(
      response.status === 403 || response.status === 404
        ? "Vidéo introuvable ou privée : vérifie le lien et les réglages de confidentialité Vimeo."
        : `Vimeo : erreur ${response.status}`,
    );
  }
  return fromOEmbed(ref, (await response.json()) as VimeoOEmbed);
}
