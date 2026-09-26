"use client";

import Link from "next/link";
import { useParams, useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { routes } from "@shared/paths";
import { AdminCourseProvider, useAdminCourse } from "@/components/course/admin-course-context";
import { CourseActions } from "@/components/course/course-actions";
import { CourseStatusBadges } from "@/components/course/course-status-badge";
import { PageContainer } from "@/components/layout/page";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

const tabs = [
  { segment: null, label: "Élèves", href: routes.adminCourse },
  { segment: "contenu", label: "Contenu", href: routes.adminCourseContent },
  { segment: "details", label: "Détails", href: routes.adminCourseDetails },
  { segment: "page-de-vente", label: "Page de vente", href: routes.adminCourseSalesPage },
  { segment: "vente", label: "Vente", href: routes.adminCourseSales },
] as const;

function CourseShell({ courseId, children }: { courseId: string; children: ReactNode }) {
  const { course, loading, error } = useAdminCourse();
  const segment = useSelectedLayoutSegment();

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="mb-8 h-7 w-96 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }
  if (!course || error) {
    return (
      <PageContainer>
        <EmptyState
          title="Formation introuvable"
          description="Elle a peut-être été supprimée, ou appartient à un autre formateur."
        />
      </PageContainer>
    );
  }

  // L'éditeur de leçon a son propre en-tête.
  if (segment === "lecons") return <>{children}</>;

  return (
    <PageContainer width="wide">
      <header className="mb-6">
        <div className="mb-1 text-[13px] text-muted">
          <Link href={routes.adminCourses} className="hover:text-ink">
            Formations
          </Link>{" "}
          / Formation
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{course.title}</h1>
            <CourseStatusBadges course={course} />
          </div>
          <CourseActions course={course} />
        </div>
        <nav
          className="mt-4 flex gap-4 overflow-x-auto border-b border-line-soft"
          aria-label="Sections de la formation"
        >
          {tabs.map((tab) => {
            const active = segment === tab.segment;
            return (
              <Link
                key={tab.label}
                href={tab.href(courseId)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 border-transparent pb-2 text-sm font-medium text-muted hover:text-ink",
                  active && "border-ink text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </PageContainer>
  );
}

export default function AdminCourseLayout({ children }: { children: ReactNode }) {
  const { courseId } = useParams<{ courseId: string }>();
  return (
    <AdminCourseProvider courseId={courseId}>
      <CourseShell courseId={courseId}>{children}</CourseShell>
    </AdminCourseProvider>
  );
}
