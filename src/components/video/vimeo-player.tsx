"use client";

import Player from "@vimeo/player";
import { useEffect, useRef } from "react";
import { vimeoEmbedUrl } from "@shared/vimeo";
import type { VimeoVideo } from "@shared/types";

export interface VimeoProgress {
  seconds: number;
  duration: number;
  percent: number;
}

/**
 * Lecteur Vimeo (SDK player.js). Les callbacks permettent la reprise de lecture et
 * la complétion automatique. Les vidéos non répertoriées passent par le paramètre `h`.
 */
export function VimeoPlayer({
  video,
  startAt,
  onProgress,
  onPause,
  onEnded,
  title,
}: {
  video: Pick<VimeoVideo, "id" | "hash">;
  startAt?: number;
  onProgress?: (progress: VimeoProgress) => void;
  onPause?: (progress: VimeoProgress) => void;
  onEnded?: () => void;
  title?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onProgress, onPause, onEnded });
  callbacks.current = { onProgress, onPause, onEnded };
  const startAtRef = useRef(startAt);

  useEffect(() => {
    if (!container.current) return;
    const iframe = document.createElement("iframe");
    iframe.src = vimeoEmbedUrl({ id: video.id, hash: video.hash });
    iframe.allow = "autoplay; fullscreen; picture-in-picture; clipboard-write";
    iframe.allowFullscreen = true;
    iframe.title = title ?? "Vidéo de la leçon";
    iframe.className = "absolute inset-0 size-full";
    container.current.replaceChildren(iframe);

    const player = new Player(iframe);
    let lastSeconds = 0;
    const toProgress = (data: {
      seconds: number;
      duration: number;
      percent: number;
    }): VimeoProgress => ({
      seconds: data.seconds,
      duration: data.duration,
      percent: data.percent,
    });

    player.on("loaded", () => {
      const start = startAtRef.current;
      if (start && start > 5) player.setCurrentTime(start).catch(() => undefined);
    });
    player.on("timeupdate", (data) => {
      lastSeconds = data.seconds;
      callbacks.current.onProgress?.(toProgress(data));
    });
    player.on("pause", (data) => callbacks.current.onPause?.(toProgress(data)));
    player.on("ended", () => callbacks.current.onEnded?.());

    return () => {
      if (lastSeconds > 0)
        callbacks.current.onPause?.({ seconds: lastSeconds, duration: 0, percent: 0 });
      player.destroy().catch(() => undefined);
    };
  }, [video.id, video.hash, title]);

  return (
    <div
      ref={container}
      className="relative aspect-video w-full overflow-hidden rounded-md bg-ink"
    />
  );
}
