"use client";

import { ExternalLink, Radio, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  LIVE_DURATIONS,
  formatLiveDate,
  liveInput,
  liveStatus,
  replayUrlSchema,
  splitLives,
  type LiveStatus,
} from "@shared/lives";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { errorMessage } from "@/lib/firebase/callables";
import { createLive, deleteLive, setLiveReplay, useLives, type Live } from "@/lib/lives";

type Errors = Partial<Record<"title" | "startsAt" | "joinUrl" | "description", string>>;

const STATUS: Record<LiveStatus, { label: string; tone: "info" | "success" | "neutral" }> = {
  upcoming: { label: "À venir", tone: "info" },
  soon: { label: "Bientôt", tone: "success" },
  live: { label: "En cours", tone: "success" },
  ended: { label: "Terminé", tone: "neutral" },
};

const durationLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;

function LiveRow({ courseId, live }: { courseId: string; live: Live }) {
  const status = liveStatus(live.start, live.durationMin);
  const [replay, setReplay] = useState(live.replayUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function saveReplay() {
    const parsed = replay.trim() ? replayUrlSchema.safeParse(replay) : null;
    if (parsed && !parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Lien invalide");
      return;
    }
    setSaving(true);
    try {
      await setLiveReplay(courseId, live.id, parsed?.data ?? null);
      toast.success(parsed ? "Replay ajouté" : "Replay retiré");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{live.title}</p>
          <p className="text-[13px] text-muted first-letter:uppercase">
            {formatLiveDate(live.start)} · {durationLabel(live.durationMin)}
          </p>
        </div>
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
        <Button asChild variant="subtle" size="icon" aria-label="Ouvrir le lien du direct">
          <a href={live.joinUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
          </a>
        </Button>
        <Button
          variant="subtle"
          size="icon"
          aria-label={`Supprimer le direct ${live.title}`}
          onClick={() => {
            if (!window.confirm(`Supprimer le direct « ${live.title} » ?`)) return;
            deleteLive(courseId, live.id).catch((error) => toast.error(errorMessage(error)));
          }}
        >
          <Trash2 />
        </Button>
      </div>
      {status === "ended" ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveReplay();
          }}
        >
          <Input
            aria-label={`Lien du replay de ${live.title}`}
            placeholder="Lien du replay (Vimeo, YouTube…), facultatif"
            value={replay}
            onChange={(e) => setReplay(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={saving || replay.trim() === (live.replayUrl ?? "")}
          >
            Enregistrer
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** Directs de la formation : programmation (lien Zoom, Meet, Teams…) et replays. */
export default function CourseLivesPage() {
  const course = useLoadedCourse();
  const { lives } = useLives(course.id);
  const { upcoming, past } = splitLives(lives);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [joinUrl, setJoinUrl] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = liveInput.safeParse({
      title,
      description,
      startsAt: when ? new Date(when) : undefined,
      durationMin,
      joinUrl,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await createLive(course, parsed.data);
      toast.success("Direct programmé : tes élèves sont prévenus");
      setTitle("");
      setWhen("");
      setJoinUrl("");
      setDescription("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle>Directs</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {lives.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Radio />}
                title="Aucun direct programmé"
                description="Sessions de questions-réponses, corrections en direct, masterclass : tes élèves les retrouvent sur la page de la formation, avec le lien et l'ajout à leur agenda."
              />
            </div>
          ) : (
            <>
              {upcoming.length ? (
                <ul className="divide-y divide-line-soft border-t border-line-soft">
                  {upcoming.map((live) => (
                    <LiveRow key={live.id} courseId={course.id} live={live} />
                  ))}
                </ul>
              ) : null}
              {past.length ? (
                <>
                  <p className="border-t border-line-soft px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-muted">
                    Passés
                  </p>
                  <ul className="divide-y divide-line-soft">
                    {past.map((live) => (
                      <LiveRow key={live.id} courseId={course.id} live={live} />
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Programmer un direct</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Titre" htmlFor="live-title" error={errors.title}>
              <Input
                id="live-title"
                value={title}
                maxLength={120}
                placeholder="Ex. Questions-réponses du mois"
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field label="Date et heure" htmlFor="live-when" error={errors.startsAt}>
                <Input
                  id="live-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </Field>
              <Field label="Durée" htmlFor="live-duration">
                <Select
                  id="live-duration"
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                >
                  {LIVE_DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {durationLabel(minutes)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Lien de connexion"
              htmlFor="live-url"
              error={errors.joinUrl}
              hint="Zoom, Google Meet, Teams… Visible seulement par les élèves inscrits, activé 15 min avant."
            >
              <Input
                id="live-url"
                type="url"
                value={joinUrl}
                placeholder="https://meet.google.com/…"
                onChange={(e) => setJoinUrl(e.target.value)}
              />
            </Field>
            <Field label="Description (facultatif)" htmlFor="live-description">
              <Textarea
                id="live-description"
                className="min-h-20"
                value={description}
                maxLength={2000}
                placeholder="Programme, ce qu'il faut préparer…"
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Programmation…" : "Programmer le direct"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
