"use client";

import { collection, doc, limit, orderBy, query, where } from "firebase/firestore";
import { CheckCircle2, ClipboardCheck, ExternalLink, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SUBMISSION_STATUS_LABEL, type SubmissionDoc } from "@shared/exercises";
import { routes } from "@shared/paths";
import type { CourseDoc, TimestampLike } from "@shared/types";
import { SubmissionViewer } from "@/components/exercises/submission-viewer";
import { PageContainer } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { setSubmissionStatus } from "@/lib/exercises";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDateTime } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import { useSchool, useSchoolStaff } from "@/lib/school";

export default function AdminSubmissionPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();
  const { schoolId } = useSchool();
  const staff = useSchoolStaff(schoolId);
  const [saving, setSaving] = useState(false);
  const submissionRef = useMemo(() => doc(db, "submissions", submissionId), [submissionId]);
  const { data: submission, loading } = useDocData<SubmissionDoc<TimestampLike>>(submissionRef);
  const courseRef = useMemo(
    () => (submission ? doc(db, "courses", submission.courseId) : null),
    [submission],
  );
  const { data: course } = useDocData<CourseDoc>(courseRef);
  // Exercices encore à corriger : on enchaîne sur le suivant.
  const pendingQuery = useMemo(
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
  const { data: all } = useQueryData<SubmissionDoc>(pendingQuery);
  const next = all.find((s) => s.status === "submitted" && s.id !== submissionId);

  async function markReviewed(reviewed: boolean) {
    setSaving(true);
    try {
      await setSubmissionStatus(submissionId, reviewed ? "reviewed" : "submitted");
      if (reviewed) {
        toast.success(next ? "Exercice corrigé, au suivant" : "Exercice corrigé");
        router.push(next ? routes.adminSubmission(next.id) : routes.adminExercises);
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageContainer width="narrow">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="aspect-video w-full" />
      </PageContainer>
    );
  }
  if (!submission || submission.creatorId !== schoolId) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          icon={<ClipboardCheck />}
          title="Exercice introuvable"
          description="Il a peut-être été retiré par l'élève."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.adminExercises}>Retour aux exercices</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        breadcrumb={
          <>
            <Link href={routes.adminExercises} className="hover:text-ink">
              Exercices
            </Link>{" "}
            / {submission.studentName}
          </>
        }
        title={submission.lessonTitle}
        actions={
          submission.status === "reviewed" ? (
            <Button variant="secondary" onClick={() => markReviewed(false)} disabled={saving}>
              <RotateCcw /> Remettre à corriger
            </Button>
          ) : (
            <Button onClick={() => markReviewed(true)} disabled={saving}>
              <CheckCircle2 /> Marquer comme corrigé
            </Button>
          )
        }
      >
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <Badge tone={submission.status === "reviewed" ? "success" : "warning"}>
            {SUBMISSION_STATUS_LABEL[submission.status]}
          </Badge>
          <span>
            Rendu par <span className="font-medium text-ink">{submission.studentName}</span> ·{" "}
            {formatDateTime(submission.createdAt)}
          </span>
          {course ? (
            <Link
              href={routes.lesson(submission.courseId, submission.lessonId)}
              className="inline-flex items-center gap-1 hover:text-ink"
            >
              <ExternalLink className="size-3.5" /> {course.title}
            </Link>
          ) : null}
        </p>
      </PageHeader>

      <Card>
        <CardBody>
          <SubmissionViewer submissionId={submissionId} submission={submission} staff={staff} />
        </CardBody>
      </Card>
    </PageContainer>
  );
}
