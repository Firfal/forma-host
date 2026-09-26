"use client";

import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { CornerDownRight, MessageSquare, PlayCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { blockRange } from "@shared/outline-edit";
import { routes } from "@shared/paths";
import type { CommentDoc, CourseDoc, ProfileDoc } from "@shared/types";
import { CommentItem, Composer } from "@/components/comments/lesson-comments";
import { PageContainer } from "@/components/layout/page";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import { useSchool, useSchoolStaff } from "@/lib/school";

type Comment = CommentDoc & { id: string };

interface Thread {
  root: Comment;
  replies: Comment[];
  lastAt: number;
  /** Dernier message d'un élève, sans réponse du formateur après lui. */
  awaitingReply: boolean;
}

interface LessonGroup {
  key: string;
  courseId: string;
  lessonId: string;
  threads: Thread[];
  lastAt: number;
}

const time = (comment: Comment) => toDate(comment.createdAt)?.getTime() ?? 0;

function buildGroups(comments: Comment[], staff: Set<string>): LessonGroup[] {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const threads = new Map<string, Thread>();
  for (const comment of [...comments].sort((a, b) => time(a) - time(b))) {
    const rootId = comment.parentId && byId.has(comment.parentId) ? comment.parentId : comment.id;
    if (rootId === comment.id) {
      threads.set(comment.id, {
        root: comment,
        replies: [],
        lastAt: time(comment),
        awaitingReply: false,
      });
    } else {
      const thread = threads.get(rootId);
      thread?.replies.push(comment);
      if (thread) thread.lastAt = Math.max(thread.lastAt, time(comment));
    }
  }
  const groups = new Map<string, LessonGroup>();
  for (const thread of threads.values()) {
    const last = thread.replies.at(-1) ?? thread.root;
    thread.awaitingReply = !staff.has(last.authorUid);
    const key = `${thread.root.courseId}:${thread.root.lessonId}`;
    const group = groups.get(key) ?? {
      key,
      courseId: thread.root.courseId,
      lessonId: thread.root.lessonId,
      threads: [],
      lastAt: 0,
    };
    group.threads.push(thread);
    group.lastAt = Math.max(group.lastAt, thread.lastAt);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, threads: group.threads.sort((a, b) => b.lastAt - a.lastAt) }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

export default function AdminCommentsPage() {
  const { user } = useAuth();
  const { schoolId } = useSchool();
  const uid = schoolId ?? "";
  const staff = useSchoolStaff(schoolId);
  const [onlyAwaiting, setOnlyAwaiting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const commentsQuery = useMemo(
    () =>
      uid
        ? query(
            collectionGroup(db, "comments"),
            where("creatorId", "==", uid),
            orderBy("createdAt", "desc"),
            limit(300),
          )
        : null,
    [uid],
  );
  const coursesQuery = useMemo(
    () => (uid ? query(collection(db, "courses"), where("creatorId", "==", uid)) : null),
    [uid],
  );
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: comments, loading } = useQueryData<CommentDoc>(commentsQuery);
  const { data: courses } = useQueryData<CourseDoc>(coursesQuery);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);
  const courseMap = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);

  const groups = useMemo(() => buildGroups(comments, staff), [comments, staff]);
  const awaitingCount = groups.reduce(
    (sum, group) => sum + group.threads.filter((t) => t.awaitingReply).length,
    0,
  );
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      threads: group.threads.filter((t) => !onlyAwaiting || t.awaitingReply),
    }))
    .filter((group) => group.threads.length > 0);

  async function reply(root: Comment, body: string) {
    await addDoc(collection(db, "courses", root.courseId, "comments"), {
      courseId: root.courseId,
      creatorId: root.creatorId,
      lessonId: root.lessonId,
      authorUid: user?.uid,
      authorName: profile?.displayName || user?.displayName || "Formateur",
      authorAvatarUrl: profile?.avatarUrl ?? null,
      body,
      parentId: root.id,
      createdAt: serverTimestamp(),
    });
  }

  function lessonContext(courseId: string, lessonId: string) {
    const course = courseMap.get(courseId);
    if (!course) return { title: "Leçon", path: "" };
    const index = course.items.findIndex((item) => item.id === lessonId);
    const lesson = course.items[index];
    const [start] = index >= 0 ? blockRange(course.items, index) : [0];
    const chapter = course.items[start]?.kind === "chapter" ? course.items[start].title : null;
    return {
      title: lesson?.title ?? "Leçon supprimée",
      path: [course.title, chapter].filter(Boolean).join(" / "),
    };
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Commentaires"
        actions={
          <div
            className="inline-flex rounded-md border border-line p-0.5 text-[13px]"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!onlyAwaiting}
              onClick={() => setOnlyAwaiting(false)}
              className={cn(
                "rounded px-2.5 py-1 font-medium text-muted",
                !onlyAwaiting && "bg-surface text-ink",
              )}
            >
              Tous
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={onlyAwaiting}
              onClick={() => setOnlyAwaiting(true)}
              className={cn(
                "rounded px-2.5 py-1 font-medium text-muted",
                onlyAwaiting && "bg-surface text-ink",
              )}
            >
              À répondre{awaitingCount ? ` (${awaitingCount})` : ""}
            </button>
          </div>
        }
      />

      {loading ? (
        <Skeleton className="h-48" />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title={onlyAwaiting ? "Tout est à jour" : "Aucun commentaire pour l'instant"}
          description={
            onlyAwaiting
              ? "Tu as répondu à toutes les questions de tes élèves."
              : "Les questions de tes élèves sous les leçons apparaîtront ici."
          }
        />
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const context = lessonContext(group.courseId, group.lessonId);
            return (
              <Card key={group.key}>
                <Link
                  href={routes.lesson(group.courseId, group.lessonId)}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-3 hover:bg-surface/60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                    <PlayCircle className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{context.title}</span>
                    <span className="block truncate text-[12px] text-muted">{context.path}</span>
                  </span>
                </Link>
                <div className="divide-y divide-line-soft">
                  {group.threads.map((thread) => (
                    <div key={thread.root.id} className="space-y-3 p-4">
                      <CommentItem
                        comment={thread.root}
                        staff={staff}
                        canDelete
                        onReply={() => setReplyTo(thread.root.id)}
                      />
                      {thread.replies.length || replyTo === thread.root.id ? (
                        <div className="ml-4 space-y-3 border-l border-line pl-4">
                          {thread.replies.map((replyComment) => (
                            <CommentItem
                              key={replyComment.id}
                              comment={replyComment}
                              staff={staff}
                              canDelete
                            />
                          ))}
                          {replyTo === thread.root.id ? (
                            <div className="flex gap-2">
                              <CornerDownRight className="mt-2.5 size-4 shrink-0 text-muted" />
                              <div className="flex-1">
                                <Composer
                                  placeholder="Répondre"
                                  autoFocus
                                  onSubmit={(body) => reply(thread.root, body)}
                                  onCancel={() => setReplyTo(null)}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
