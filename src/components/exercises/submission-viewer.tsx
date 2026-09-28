"use client";

import { collection, doc, orderBy, query } from "firebase/firestore";
import { Clock, ExternalLink, FileText, Loader2, Send, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  EXERCISE_LIMITS,
  formatTimecode,
  submissionMedia,
  type FeedbackDoc,
  type SubmissionDoc,
} from "@shared/exercises";
import type { ProfileDoc, TimestampLike } from "@shared/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { addFeedback, deleteFeedback, useSubmissionFileUrl } from "@/lib/exercises";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import { formatFileSize } from "@/lib/storage";

/**
 * Exercice rendu et ses retours : la vidéo se commente au moment voulu (repère cliquable),
 * les autres rendus (image, PDF, lien) par des retours généraux.
 */
export function SubmissionViewer({
  submissionId,
  submission,
  staff,
}: {
  submissionId: string;
  submission: SubmissionDoc;
  /** Équipe de l'école : ses retours sont mis en avant. */
  staff: Set<string>;
}) {
  const { user } = useAuth();
  const media = submissionMedia(submission);
  const url = useSubmissionFileUrl(submission.file?.path);
  const video = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  // L'équipe commente un moment précis ; l'élève répond plutôt sur l'ensemble.
  const isStaff = Boolean(user && staff.has(user.uid));
  // null : choix par défaut (l'équipe de l'école est connue après chargement).
  const [atTimeChoice, setAtCurrentTime] = useState<boolean | null>(null);
  const atCurrentTime = atTimeChoice ?? isStaff;
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const feedbackQuery = useMemo(
    () =>
      query(collection(db, "submissions", submissionId, "feedback"), orderBy("createdAt", "asc")),
    [submissionId],
  );
  const { data: feedback } = useQueryData<FeedbackDoc<TimestampLike>>(feedbackQuery);
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);

  function seek(seconds: number) {
    const player = video.current;
    if (!player) return;
    player.currentTime = seconds;
    player.focus();
    void player.play().catch(() => undefined);
  }

  async function send() {
    const text = body.trim();
    if (!user || !text) return;
    // Zone vidée tout de suite (le retour apparaît en temps réel), rétablie en cas d'erreur.
    setBody("");
    setSending(true);
    try {
      await addFeedback(submissionId, {
        authorUid: user.uid,
        authorName:
          profile?.displayName || user.displayName || user.email?.split("@")[0] || "Membre",
        atSec: media === "video" && atCurrentTime ? currentTime : null,
        body: text,
      });
    } catch (error) {
      setBody(text);
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {media === "video" ? (
        url ? (
          <video
            ref={video}
            src={url}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-md bg-black"
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-md bg-surface">
            <Loader2 className="size-5 animate-spin text-muted" />
          </div>
        )
      ) : media === "image" ? (
        url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={submission.file?.name ?? "Exercice"}
              className="max-h-[70vh] w-full rounded-md bg-surface object-contain"
            />
          </a>
        ) : (
          <div className="h-48 rounded-md bg-surface" />
        )
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
          {media === "pdf" ? (
            <FileText className="size-5 shrink-0 text-muted" />
          ) : (
            <ExternalLink className="size-5 shrink-0 text-muted" />
          )}
          <span className="min-w-0 flex-1 truncate text-[14px]">
            {submission.file?.name ?? submission.link}
          </span>
          {submission.file ? (
            <span className="text-[12px] text-muted">{formatFileSize(submission.file.size)}</span>
          ) : null}
          <Button asChild variant="secondary" size="sm">
            <a
              href={submission.link ?? url ?? "#"}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              Ouvrir
            </a>
          </Button>
        </div>
      )}

      {submission.note ? (
        <p className="whitespace-pre-line rounded-md bg-surface px-3 py-2 text-[14px]">
          {submission.note}
        </p>
      ) : null}

      <div>
        <h3 className="mb-2 text-[13px] font-semibold">
          Retours{feedback.length ? ` (${feedback.length})` : ""}
        </h3>
        {feedback.length === 0 ? (
          <p className="text-[13px] text-muted">Aucun retour pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3">
            {feedback.map((item) => (
              <li key={item.id} className="flex gap-2.5">
                <Avatar name={item.authorName} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
                    <span className="font-semibold">{item.authorName}</span>
                    {staff.has(item.authorUid) ? (
                      <span className="rounded bg-brand-soft px-1 text-[11px] font-medium text-brand">
                        Formateur
                      </span>
                    ) : null}
                    <span className="text-muted">{formatRelative(item.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-line text-[14px]">
                    {item.atSec != null ? (
                      <button
                        type="button"
                        onClick={() => seek(item.atSec!)}
                        disabled={media !== "video"}
                        className="mr-1.5 inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-px align-baseline text-[12px] font-semibold tabular-nums text-brand hover:underline"
                        aria-label={`Revoir le passage à ${formatTimecode(item.atSec)}`}
                      >
                        <Clock className="size-3" />
                        {formatTimecode(item.atSec)}
                      </button>
                    ) : null}
                    {item.body}
                  </p>
                </div>
                {item.authorUid === user?.uid ? (
                  <Button
                    variant="subtle"
                    size="icon"
                    aria-label="Supprimer ce retour"
                    onClick={() =>
                      deleteFeedback(submissionId, item.id).catch((error) =>
                        toast.error(errorMessage(error)),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          aria-label={isStaff ? "Écrire un retour" : "Répondre"}
          placeholder={
            !isStaff
              ? "Une question sur un retour ? Réponds ici…"
              : media === "video"
                ? "Mets la vidéo en pause au bon moment, puis écris ton retour…"
                : "Écrire un retour…"
          }
          className="min-h-20"
          maxLength={EXERCISE_LIMITS.feedback}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {media === "video" ? (
            <label className="mr-auto flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-ink)]"
                checked={atCurrentTime}
                onChange={(e) => setAtCurrentTime(e.target.checked)}
              />
              À{" "}
              <span className={cn("font-semibold tabular-nums", !atCurrentTime && "text-muted")}>
                {formatTimecode(currentTime)}
              </span>{" "}
              dans la vidéo
            </label>
          ) : null}
          <Button type="submit" size="sm" disabled={!body.trim() || sending}>
            <Send /> {sending ? "Envoi…" : "Envoyer"}
          </Button>
        </div>
      </form>
    </div>
  );
}
