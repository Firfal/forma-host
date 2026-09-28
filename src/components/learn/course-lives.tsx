"use client";

import { CalendarPlus, PlayCircle, Radio, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { JOIN_EARLY_MIN, formatLiveDate, liveStatus, splitLives } from "@shared/lives";
import { routes } from "@shared/paths";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { downloadIcs, useLives } from "@/lib/lives";

const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "short",
  timeZone: "Europe/Paris",
});
const dayFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: "Europe/Paris" });

/** Directs de la formation côté élève : à venir (rejoindre, agenda) et replays. */
export function CourseLives({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const { lives } = useLives(courseId);
  // Horloge : le bouton « Rejoindre » s'active tout seul à l'approche du direct.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const { upcoming, past } = splitLives(lives, now);
  const replays = past.filter((live) => live.replayUrl).slice(0, 3);
  if (!upcoming.length && !replays.length) return null;

  return (
    <section id="directs" aria-labelledby="lives-title" className="scroll-mt-6 space-y-3">
      <h2 id="lives-title" className="flex items-center gap-2 font-semibold">
        <Radio className="size-4 text-muted" /> Directs
      </h2>
      {upcoming.slice(0, 3).map((live) => {
        const status = liveStatus(live.start, live.durationMin, now);
        const open = status === "soon" || status === "live";
        return (
          <Card key={live.id} className="flex gap-4 p-4">
            <div className="flex w-12 shrink-0 flex-col items-center rounded-md bg-brand-soft py-1.5 text-brand">
              <span className="text-[11px] font-semibold uppercase">
                {monthFormatter.format(live.start).replace(".", "")}
              </span>
              <span className="text-lg font-bold leading-6">{dayFormatter.format(live.start)}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {live.title}
                  {status === "live" ? <Badge tone="danger">En direct</Badge> : null}
                </p>
                <p className="text-[13px] text-muted first-letter:uppercase">
                  {formatLiveDate(live.start)} · {live.durationMin} min
                </p>
              </div>
              {live.description ? (
                <p className="whitespace-pre-line text-[14px]">{live.description}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {open ? (
                  <Button asChild size="sm">
                    <a href={live.joinUrl} target="_blank" rel="noopener noreferrer">
                      <Video /> Rejoindre le direct
                    </a>
                  </Button>
                ) : (
                  <span className="text-[12px] text-muted">
                    Le lien s&apos;active {JOIN_EARLY_MIN} min avant le début.
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadIcs(live, courseTitle)}
                >
                  <CalendarPlus /> Ajouter à mon agenda
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
      {replays.length ? (
        <Card className="divide-y divide-line-soft">
          {replays.map((live) => (
            <a
              key={live.id}
              href={live.replayUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-3 px-4 py-2.5 text-[14px] hover:bg-surface/60"
            >
              <PlayCircle className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">Replay : {live.title}</span>
              <span className="shrink-0 text-[12px] text-muted first-letter:uppercase">
                {formatLiveDate(live.start).split(" à ")[0]}
              </span>
            </a>
          ))}
        </Card>
      ) : null}
    </section>
  );
}

/** Bandeau « prochain direct » d'une formation (page « Mes formations »). */
export function NextLiveBanner({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const { lives } = useLives(courseId);
  const [now] = useState(() => new Date());
  const next = splitLives(lives, now).upcoming[0];
  if (!next) return null;
  const status = liveStatus(next.start, next.durationMin, now);
  const open = status === "soon" || status === "live";
  return (
    <Card className="mb-3 flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
        <Radio className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          {status === "live" ? "En direct : " : "Prochain direct : "}
          {next.title}
        </span>
        <span className="block truncate text-[13px] text-muted first-letter:uppercase">
          {formatLiveDate(next.start)} · {courseTitle}
        </span>
      </span>
      {open ? (
        <Button asChild size="sm">
          <a href={next.joinUrl} target="_blank" rel="noopener noreferrer">
            <Video /> Rejoindre
          </a>
        </Button>
      ) : (
        <Button asChild variant="secondary" size="sm">
          <Link href={`${routes.course(courseId)}#directs`}>Voir</Link>
        </Button>
      )}
    </Card>
  );
}
