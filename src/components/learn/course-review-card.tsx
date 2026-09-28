"use client";

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  RATING_LABELS,
  courseReviewInput,
  shouldAskReview,
  type CourseReviewDoc,
} from "@shared/attendance";
import type { ProfileDoc } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

function Stars({
  value,
  onChange,
  size = "size-6",
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  if (!onChange) {
    return (
      <span className="inline-flex" aria-label={`${value} sur 5`}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <Star
            key={rating}
            className={cn(size, rating <= value ? "fill-warning text-warning" : "text-line")}
          />
        ))}
      </span>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label="Note"
      className="inline-flex"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={`${rating} sur 5 : ${RATING_LABELS[rating]}`}
          className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-logo/40"
          onMouseEnter={() => setHover(rating)}
          onClick={() => onChange(rating)}
        >
          <Star
            className={cn(
              size,
              "transition-colors",
              rating <= shown ? "fill-warning text-warning" : "text-line",
            )}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Avis de fin de formation (évaluation « à chaud », Qualiopi) : proposé à partir de la moitié
 * de la formation, visible seulement par l'école.
 */
export function CourseReviewCard({
  courseId,
  creatorId,
  done,
  total,
}: {
  courseId: string;
  creatorId: string;
  done: number;
  total: number;
}) {
  const { user } = useAuth();
  const reviewRef = useMemo(
    () => (user ? doc(db, "reviews", `${courseId}_${user.uid}`) : null),
    [user, courseId],
  );
  const { data: review, loading } = useDocData<CourseReviewDoc>(reviewRef);
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user || loading || !shouldAskReview(done, total)) return null;

  function startEditing() {
    setRating(review?.rating ?? 0);
    setRecommend(review?.recommend ?? null);
    setComment(review?.comment ?? "");
    setEditing(true);
  }

  async function save() {
    if (!user || !reviewRef) return;
    const parsed = courseReviewInput.safeParse({ rating, recommend: recommend ?? true, comment });
    if (!parsed.success || recommend === null) {
      toast.error(
        recommend === null
          ? "Dis-nous si tu recommanderais la formation."
          : (parsed.error?.issues[0]?.message ?? "Avis incomplet"),
      );
      return;
    }
    setSaving(true);
    try {
      await setDoc(reviewRef, {
        ...parsed.data,
        courseId,
        uid: user.uid,
        creatorId,
        studentName: (
          profile?.displayName ||
          user.displayName ||
          user.email?.split("@")[0] ||
          "Élève"
        ).slice(0, 80),
        createdAt: review ? review.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
      toast.success("Merci pour ton avis !");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (review && !editing) {
    return (
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex-1">
          <p className="font-medium">Merci pour ton avis !</p>
          <Stars value={review.rating} size="size-4" />
        </div>
        <Button variant="ghost" size="sm" onClick={startEditing}>
          Modifier
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="font-semibold">Ton avis sur la formation</p>
        <p className="text-[13px] text-muted">
          Il aide ton formateur à l&apos;améliorer. Seule l&apos;école le lit.
        </p>
      </div>
      {!editing && !review ? (
        <div className="flex flex-wrap items-center gap-3">
          <Stars
            value={0}
            onChange={(next) => {
              startEditing();
              setRating(next);
            }}
          />
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <Stars value={rating} onChange={setRating} />
            <span className="text-[13px] text-muted">{RATING_LABELS[rating]}</span>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium">
              Tu recommanderais cette formation ?
            </legend>
            <div className="inline-flex rounded-md border border-line p-0.5 text-[13px]">
              {(
                [
                  [true, "Oui"],
                  [false, "Non"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={recommend === value}
                  onClick={() => setRecommend(value)}
                  className={cn(
                    "rounded px-3 py-1 font-medium text-muted",
                    recommend === value && "bg-surface text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          <Textarea
            aria-label="Ton commentaire"
            placeholder="Ce qui t'a plu, ce qui manque… (facultatif)"
            className="min-h-20"
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {review ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={saving || !rating}>
              {saving ? "Envoi…" : "Envoyer mon avis"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export { Stars };
