"use client";

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import {
  ChevronRight,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  Link2,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  SUBMISSION_STATUS_LABEL,
  submissionMedia,
  type SubmissionDoc,
  type SubmissionStatus,
} from "@shared/exercises";
import { routes } from "@shared/paths";
import type { CourseDoc, TimestampLike } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchool } from "@/lib/school";

type Filter = SubmissionStatus | "all";

const mediaIcons = { video: Video, image: ImageIcon, pdf: FileText, link: Link2 };

export default function AdminExercisesPage() {
  const { schoolId } = useSchool();
  const [filter, setFilter] = useState<Filter>("submitted");
  const submissionsQuery = useMemo(
    () =>
      schoolId
        ? query(
            collection(db, "submissions"),
            where("creatorId", "==", schoolId),
            orderBy("createdAt", "desc"),
            limit(300),
          )
        : null,
    [schoolId],
  );
  const coursesQuery = useMemo(
    () => (schoolId ? query(collection(db, "courses"), where("creatorId", "==", schoolId)) : null),
    [schoolId],
  );
  const { data: submissions, loading } =
    useQueryData<SubmissionDoc<TimestampLike>>(submissionsQuery);
  const { data: courses } = useQueryData<CourseDoc>(coursesQuery);
  const courseTitles = useMemo(
    () => new Map(courses.map((course) => [course.id, course.title])),
    [courses],
  );
  const pending = submissions.filter((s) => s.status === "submitted").length;
  const rows = submissions.filter((s) => filter === "all" || s.status === filter);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Exercices"
        actions={
          <div
            className="inline-flex rounded-md border border-line p-0.5 text-[13px]"
            role="tablist"
          >
            {(
              [
                ["submitted", `À corriger${pending ? ` (${pending})` : ""}`],
                ["reviewed", "Corrigés"],
                ["all", "Tous"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium text-muted",
                  filter === value && "bg-surface text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title={
            filter === "submitted" && submissions.length
              ? "Tout est corrigé"
              : "Aucun exercice pour l'instant"
          }
          description={
            filter === "submitted" && submissions.length
              ? "Tu as corrigé tous les exercices rendus."
              : "Active « Exercice à rendre » sur une leçon : les rendus de tes élèves arriveront ici."
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line-soft">
            {rows.map((submission) => {
              const Icon = mediaIcons[submissionMedia(submission)];
              return (
                <li key={submission.id}>
                  <Link
                    href={routes.adminSubmission(submission.id)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface/60"
                  >
                    <Avatar name={submission.studentName} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{submission.studentName}</span>
                        <Icon className="size-3.5 shrink-0 text-muted" aria-hidden />
                      </span>
                      <span className="block truncate text-[13px] text-muted">
                        {submission.lessonTitle}
                        {courseTitles.get(submission.courseId)
                          ? ` · ${courseTitles.get(submission.courseId)}`
                          : ""}
                      </span>
                    </span>
                    <span className="hidden text-[12px] text-muted sm:block">
                      {formatRelative(submission.createdAt)}
                    </span>
                    <Badge tone={submission.status === "reviewed" ? "success" : "warning"}>
                      {SUBMISSION_STATUS_LABEL[submission.status]}
                    </Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </PageContainer>
  );
}
