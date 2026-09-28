"use client";

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { ThumbsUp } from "lucide-react";
import { useMemo } from "react";
import { reviewSummary, type CourseReviewDoc } from "@shared/attendance";
import type { TimestampLike } from "@shared/types";
import { BarList } from "@/components/charts/bar-list";
import { Stars } from "@/components/learn/course-review-card";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** Satisfaction des élèves (avis de fin de formation) : note moyenne, répartition, commentaires. */
export function SatisfactionCard({
  schoolId,
  courseId,
  courseTitles,
}: {
  schoolId: string;
  /** « all » : toutes les formations. */
  courseId: string;
  courseTitles: Map<string, string>;
}) {
  const reviewsQuery = useMemo(
    () =>
      query(
        collection(db, "reviews"),
        where("creatorId", "==", schoolId),
        orderBy("updatedAt", "desc"),
        limit(500),
      ),
    [schoolId],
  );
  const { data, loading } = useQueryData<CourseReviewDoc<TimestampLike>>(reviewsQuery);
  if (loading) return null;
  const reviews = data.filter((review) => courseId === "all" || review.courseId === courseId);
  const summary = reviewSummary(reviews);
  const comments = reviews.filter((review) => review.comment).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Satisfaction des élèves</CardTitle>
      </CardHeader>
      <CardBody>
        {summary.count === 0 ? (
          <p className="text-[13px] text-muted">
            Aucun avis pour l&apos;instant. Tes élèves donnent leur avis depuis la page de la
            formation, à partir de la moitié du parcours.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
            <div className="space-y-1">
              <p className="text-3xl font-semibold tabular-nums">
                {decimal.format(summary.average)}
                <span className="text-base font-normal text-muted"> / 5</span>
              </p>
              <Stars value={Math.round(summary.average)} size="size-4" />
              <p className="text-[13px] text-muted">{summary.count} avis</p>
              <p className="flex items-center gap-1.5 pt-2 text-[13px]">
                <ThumbsUp className="size-4 text-muted" />
                {summary.recommendPercent} % recommandent la formation
              </p>
            </div>
            <BarList
              numbered={false}
              title="Répartition des notes"
              rows={summary.distribution.map((row) => ({
                key: String(row.rating),
                label: `${row.rating} étoile${row.rating > 1 ? "s" : ""}`,
                percent: Math.round((row.count / summary.count) * 100),
                detail: `${row.count} avis`,
              }))}
            />
          </div>
        )}
        {comments.length ? (
          <ul className="mt-6 divide-y divide-line-soft border-t border-line-soft">
            {comments.map((review) => (
              <li key={review.id} className="space-y-1 py-3">
                <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                  <Stars value={review.rating} size="size-3.5" />
                  <span className="font-medium text-ink">{review.studentName}</span>
                  {courseId === "all" && courseTitles.get(review.courseId) ? (
                    <span>· {courseTitles.get(review.courseId)}</span>
                  ) : null}
                  <span>· {formatRelative(review.updatedAt)}</span>
                </p>
                <p className="whitespace-pre-line text-[14px]">{review.comment}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
