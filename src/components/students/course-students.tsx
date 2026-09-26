"use client";

import { collection, getCountFromServer, orderBy, query, where } from "firebase/firestore";
import { Download, MailPlus, MoreHorizontal, Search, UserCheck, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { completedCount, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { EnrollmentDoc } from "@shared/types";
import { CourseStatusBadges } from "@/components/course/course-status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import type { CourseWithId } from "@/lib/courses";
import { useCreator } from "@/lib/creator";
import {
  callGrantAccess,
  callResendInvite,
  callRevokeAccess,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDate, formatRelative, toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { GrantAccessDialog } from "./grant-access-dialog";
import { ProgressRing } from "./progress-ring";
import { WelcomeEmailDialog } from "./welcome-email-dialog";

type Enrollment = EnrollmentDoc & { id: string };
type Filter = "active" | "revoked" | "all";

const sourceLabels: Record<EnrollmentDoc["source"], string> = {
  invite: "Invitation",
  import: "Import",
  stripe: "Achat",
};

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function exportCsv(course: CourseWithId, rows: Enrollment[]) {
  const total = visibleLessons(course.items).length;
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    [
      "Nom",
      "Email",
      "Statut",
      "Progression",
      "Leçons terminées",
      "Inscription",
      "Dernière activité",
    ].join(","),
    ...rows.map((row) => {
      const done = completedCount(course.items, row.progress.completedLessonIds);
      return [
        escape(row.displayName ?? ""),
        escape(row.email),
        row.status === "active" ? "Actif" : "Retiré",
        `${total ? Math.round((done / total) * 100) : 0}%`,
        `${done}/${total}`,
        toDate(row.joinedAt)?.toISOString().slice(0, 10) ?? "",
        toDate(row.progress.lastActivityAt)?.toISOString().slice(0, 10) ?? "",
      ].join(",");
    }),
  ];
  const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `eleves-${course.slug}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function StudentActions({ course, enrollment }: { course: CourseWithId; enrollment: Enrollment }) {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const input = { courseId: course.id, uid: enrollment.uid };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="subtle"
          size="icon"
          aria-label={`Actions pour ${enrollment.email}`}
          disabled={busy}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {enrollment.status === "active" ? (
          <>
            <DropdownMenuItem
              onSelect={() => void run(() => callResendInvite(input), "Email d'accès renvoyé")}
            >
              <MailPlus /> Renvoyer l&apos;email d&apos;accès
            </DropdownMenuItem>
            <DropdownMenuItem
              tone="danger"
              onSelect={() => {
                if (
                  window.confirm(`Retirer l'accès de ${enrollment.email} à « ${course.title} » ?`)
                ) {
                  void run(() => callRevokeAccess(input), "Accès retiré");
                }
              }}
            >
              <UserX /> Retirer l&apos;accès
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onSelect={() =>
              void run(
                () =>
                  callGrantAccess({
                    courseId: course.id,
                    source: "invite",
                    sendEmail: false,
                    students: [{ email: enrollment.email }],
                  }),
                "Accès rétabli",
              )
            }
          >
            <UserCheck /> Redonner l&apos;accès
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CourseStudents({ course }: { course: CourseWithId }) {
  const { data: creator } = useCreator(course.creatorId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [commentCount, setCommentCount] = useState<number | null>(null);

  const enrollmentsQuery = useMemo(
    () =>
      query(
        collection(db, "enrollments"),
        where("creatorId", "==", course.creatorId),
        where("courseId", "==", course.id),
        orderBy("joinedAt", "desc"),
      ),
    [course.creatorId, course.id],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);

  // Lien depuis la page Membres : /admin/formations/[id]?q=email
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      setSearch(q);
      setFilter("all");
    }
  }, []);

  useEffect(() => {
    getCountFromServer(
      query(
        collection(db, "courses", course.id, "comments"),
        where("creatorId", "==", course.creatorId),
      ),
    )
      .then((snap) => setCommentCount(snap.data().count))
      .catch(() => setCommentCount(null));
  }, [course.id, course.creatorId]);

  const total = visibleLessons(course.items).length;
  const active = enrollments.filter((enrollment) => enrollment.status === "active");
  const stats = useMemo(() => {
    const percents = active.map((e) =>
      total ? completedCount(course.items, e.progress.completedLessonIds) / total : 0,
    );
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      average: percents.length
        ? Math.round((percents.reduce((a, b) => a + b, 0) / percents.length) * 100)
        : 0,
      finished: percents.filter((p) => p >= 1).length,
      activeThisWeek: active.filter(
        (e) => (toDate(e.progress.lastActivityAt)?.getTime() ?? 0) > weekAgo,
      ).length,
    };
  }, [active, course.items, total]);

  const needle = search.trim().toLowerCase();
  const rows = enrollments.filter(
    (enrollment) =>
      (filter === "all" || enrollment.status === filter) &&
      (!needle ||
        enrollment.email.includes(needle) ||
        (enrollment.displayName ?? "").toLowerCase().includes(needle)),
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
      <Card className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un élève"
              aria-label="Rechercher un élève"
              className="h-9 w-full rounded-md pl-8 pr-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-logo/25"
            />
          </div>
          <div
            className="inline-flex rounded-md border border-line p-0.5 text-[13px]"
            role="tablist"
          >
            {(
              [
                ["active", "Actifs"],
                ["revoked", "Retirés"],
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
          <Button
            variant="subtle"
            size="sm"
            onClick={() => exportCsv(course, rows)}
            disabled={rows.length === 0}
          >
            <Download /> Exporter
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : enrollments.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users />}
              title="Aucun élève pour l'instant"
              description="Invite tes élèves par email ou importe l'export clients de Podia."
              action={
                <GrantAccessDialog
                  courseId={course.id}
                  courseTitle={course.title}
                  schoolId={course.creatorId}
                />
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[13px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">
                    {rows.length} élève{rows.length > 1 ? "s" : ""}
                  </th>
                  <th className="px-3 py-2.5 font-medium">Progression</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Inscription</th>
                  <th className="hidden px-3 py-2.5 font-medium xl:table-cell">
                    Dernière activité
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((enrollment) => {
                  const done = completedCount(course.items, enrollment.progress.completedLessonIds);
                  return (
                    <tr key={enrollment.id} className="border-t border-line-soft">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={enrollment.displayName || enrollment.email} size={30} />
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate font-medium",
                                enrollment.status === "revoked" && "text-muted line-through",
                              )}
                            >
                              {enrollment.displayName || enrollment.email}
                            </p>
                            {enrollment.displayName ? (
                              <p className="truncate text-[12px] text-muted">{enrollment.email}</p>
                            ) : null}
                          </div>
                          <Badge className="hidden sm:inline-flex">
                            {sourceLabels[enrollment.source]}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2 tabular-nums">
                          <ProgressRing value={total ? done / total : 0} />
                          <span>
                            {done} <span className="text-muted">/ {total}</span>
                          </span>
                        </span>
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted md:table-cell">
                        {formatDate(enrollment.joinedAt)}
                      </td>
                      <td className="hidden px-3 py-2.5 text-muted xl:table-cell">
                        {enrollment.progress.lastActivityAt
                          ? formatRelative(enrollment.progress.lastActivityAt)
                          : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <StudentActions course={course} enrollment={enrollment} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <Card>
          <CardBody className="space-y-2">
            <GrantAccessDialog
              courseId={course.id}
              courseTitle={course.title}
              schoolId={course.creatorId}
            />
            <div>
              <WelcomeEmailDialog course={course} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            <StatRow label="Leçons" value={total} />
            <StatRow label="Créée le" value={formatDate(course.createdAt)} />
            <StatRow
              label="Commentaires"
              value={
                { active: "Actifs", restricted: "Restreints", hidden: "Masqués" }[
                  course.commentsMode
                ]
              }
            />
            <div className="pt-2">
              <CourseStatusBadges course={course} />
            </div>
            {creator && course.status === "published" ? (
              <Link
                href={routes.salesPage(creator.slug, course.slug)}
                target="_blank"
                className="mt-2 block truncate text-[13px] text-muted underline underline-offset-2 hover:text-ink"
              >
                /{creator.slug}/{course.slug}
              </Link>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Statistiques</CardTitle>
          </CardHeader>
          <CardBody className="pt-2">
            <StatRow label="Élèves actifs" value={active.length} />
            <StatRow label="Actifs cette semaine" value={stats.activeThisWeek} />
            <StatRow label="Progression moyenne" value={`${stats.average} %`} />
            <StatRow label="Ont terminé" value={stats.finished} />
            <StatRow label="Commentaires" value={commentCount ?? "—"} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
