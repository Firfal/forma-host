"use client";

import { collection, orderBy, query, where } from "firebase/firestore";
import { BookOpen, Search, Settings2, Sparkles, Star, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { completedCount, visibleLessons } from "@shared/outline";
import { routes } from "@shared/paths";
import type { CourseDoc, EnrollmentDoc, TimestampLike } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase/client";
import { formatDate, memberSeniority, toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

interface Member {
  uid: string;
  email: string;
  name: string | null;
  joinedAt: TimestampLike | null;
  enrollments: (EnrollmentDoc & { id: string })[];
}

export default function MembersPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const enrollmentsQuery = useMemo(
    () =>
      user
        ? query(
            collection(db, "enrollments"),
            where("creatorId", "==", user.uid),
            orderBy("joinedAt", "desc"),
          )
        : null,
    [user],
  );
  const coursesQuery = useMemo(
    () => (user ? query(collection(db, "courses"), where("creatorId", "==", user.uid)) : null),
    [user],
  );
  const { data: enrollments, loading } = useQueryData<EnrollmentDoc>(enrollmentsQuery);
  const { data: courses } = useQueryData<CourseDoc>(coursesQuery);
  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const members = useMemo(() => {
    const byUid = new Map<string, Member>();
    for (const enrollment of enrollments) {
      const member = byUid.get(enrollment.uid) ?? {
        uid: enrollment.uid,
        email: enrollment.email,
        name: enrollment.displayName,
        joinedAt: enrollment.joinedAt,
        enrollments: [],
      };
      member.enrollments.push(enrollment);
      if (
        (toDate(enrollment.joinedAt)?.getTime() ?? Infinity) <
        (toDate(member.joinedAt)?.getTime() ?? Infinity)
      ) {
        member.joinedAt = enrollment.joinedAt;
      }
      member.name ??= enrollment.displayName;
      byUid.set(enrollment.uid, member);
    }
    return [...byUid.values()].filter((member) =>
      member.enrollments.some((e) => e.status === "active"),
    );
  }, [enrollments]);

  const needle = search.trim().toLowerCase();
  const visible = members.filter(
    (member) =>
      !needle ||
      member.email.includes(needle) ||
      (member.name ?? "").toLowerCase().includes(needle),
  );

  return (
    <PageContainer width="wide">
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <h1 className="text-lg font-semibold">Membres</h1>
        <span className="text-[13px] text-muted">
          {members.length} élève{members.length > 1 ? "s" : ""}
        </span>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher"
            aria-label="Rechercher un membre"
            className="h-9 w-full rounded-md border border-line pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-logo/25"
          />
        </div>
      </header>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Aucun membre pour l'instant"
          description="Les élèves à qui tu donnes accès à une formation apparaissent ici."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.adminCourses}>Voir mes formations</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((member) => {
            const seniority = memberSeniority(member.joinedAt);
            const activeEnrollments = member.enrollments.filter((e) => e.status === "active");
            return (
              <Card key={member.uid} className="flex flex-col overflow-hidden">
                <div className="flex h-28 items-center justify-center bg-surface">
                  <Avatar
                    name={member.name || member.email}
                    size={56}
                    className="bg-white text-lg"
                  />
                </div>
                <div className="flex-1 space-y-1.5 border-t border-line-soft p-3">
                  <p className="truncate font-semibold">{member.name || member.email}</p>
                  {member.name ? (
                    <p className="truncate text-[12px] text-muted">{member.email}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {seniority.isNew ? (
                      <Badge tone="success">
                        <Sparkles /> Nouveau
                      </Badge>
                    ) : (
                      <Badge tone="info">
                        <Star /> {seniority.label}
                      </Badge>
                    )}
                    <Badge>
                      <BookOpen /> {activeEnrollments.length} formation
                      {activeEnrollments.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <p className="text-[12px] text-muted">
                    A rejoint le {formatDate(member.joinedAt)}
                  </p>
                </div>
                <div className="border-t border-line-soft p-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full">
                        <Settings2 /> Gérer
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center" className="w-72">
                      <DropdownMenuLabel>Formations</DropdownMenuLabel>
                      {member.enrollments.map((enrollment) => {
                        const course = courseById.get(enrollment.courseId);
                        const total = course ? visibleLessons(course.items).length : 0;
                        const done = course
                          ? completedCount(course.items, enrollment.progress.completedLessonIds)
                          : 0;
                        return (
                          <DropdownMenuItem key={enrollment.id} asChild>
                            <Link
                              href={`${routes.adminCourse(enrollment.courseId)}?q=${encodeURIComponent(member.email)}`}
                            >
                              <BookOpen />
                              <span className="min-w-0 flex-1 truncate">
                                {course?.title ?? "Formation"}
                              </span>
                              <span className="text-[12px] tabular-nums text-muted">
                                {enrollment.status === "active" ? `${done}/${total}` : "retiré"}
                              </span>
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
