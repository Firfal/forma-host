"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { CornerDownRight, MessageSquare, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { CommentDoc, ProfileDoc } from "@shared/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { CourseWithId } from "@/lib/courses";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";
import { useSchoolStaff } from "@/lib/school";

type CommentWithId = CommentDoc & { id: string };

export function Composer({
  placeholder,
  onSubmit,
  autoFocus,
  onCancel,
}: {
  placeholder: string;
  onSubmit: (body: string) => Promise<void>;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    // Vidé tout de suite (le commentaire s'affiche en temps réel), restauré en cas d'erreur.
    setBody("");
    setSending(true);
    try {
      await onSubmit(text);
      onCancel?.();
    } catch (error) {
      setBody(text);
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        maxLength={5000}
        className={cn("min-h-10 resize-y transition-[min-height]", body && "min-h-20")}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit(event);
        }}
      />
      {body || onCancel ? (
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Annuler
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={sending || !body.trim()}>
            {sending ? "Envoi…" : "Publier"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function CommentItem({
  comment,
  staff,
  canDelete,
  onReply,
}: {
  comment: CommentWithId;
  /** Équipe de l'école (badge « Créateur »). */
  staff: Set<string>;
  canDelete: boolean;
  onReply?: () => void;
}) {
  const isCreator = staff.has(comment.authorUid);
  async function remove() {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    try {
      await deleteDoc(doc(db, "courses", comment.courseId, "comments", comment.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }
  return (
    <div id={`comment-${comment.id}`} className="flex scroll-mt-24 gap-3">
      <Avatar name={comment.authorName} src={comment.authorAvatarUrl} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-semibold">{comment.authorName}</span>
          {isCreator ? <Badge tone="brand">Créateur</Badge> : null}
          <span className="text-muted">{formatRelative(comment.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
        <div className="mt-1 flex gap-3 text-[12px] text-muted">
          {onReply ? (
            <button type="button" className="hover:text-ink" onClick={onReply}>
              Répondre
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-danger"
              onClick={remove}
            >
              <Trash2 className="size-3" /> Supprimer
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Commentaires d'une leçon : un fil par commentaire, un niveau de réponse. */
export function LessonComments({
  course,
  lessonId,
  canRead,
  isOwner,
}: {
  course: CourseWithId;
  lessonId: string;
  canRead: boolean;
  isOwner: boolean;
}) {
  const { user } = useAuth();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const commentsQuery = useMemo(
    () =>
      canRead
        ? query(
            collection(db, "courses", course.id, "comments"),
            where("lessonId", "==", lessonId),
            orderBy("createdAt", "asc"),
          )
        : null,
    [canRead, course.id, lessonId],
  );
  const { data: comments, loading } = useQueryData<CommentDoc>(commentsQuery);
  const staff = useSchoolStaff(course.creatorId);
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);

  const roots = comments.filter((comment) => !comment.parentId);
  const replies = useMemo(() => {
    const byParent = new Map<string, CommentWithId[]>();
    comments.forEach((comment) => {
      if (!comment.parentId) return;
      byParent.set(comment.parentId, [...(byParent.get(comment.parentId) ?? []), comment]);
    });
    return byParent;
  }, [comments]);

  // Lien de notification (#comment-…) : on fait défiler jusqu'au commentaire.
  useEffect(() => {
    if (loading || !window.location.hash.startsWith("#comment-")) return;
    document
      .querySelector(window.location.hash)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading]);

  const canWrite = isOwner || course.commentsMode === "active";

  async function post(body: string, parentId: string | null) {
    if (!user) return;
    await addDoc(collection(db, "courses", course.id, "comments"), {
      courseId: course.id,
      creatorId: course.creatorId,
      lessonId,
      authorUid: user.uid,
      authorName:
        profile?.displayName || user.displayName || (user.email ?? "Membre").split("@")[0],
      authorAvatarUrl: profile?.avatarUrl ?? null,
      body,
      parentId,
      createdAt: serverTimestamp(),
    });
  }

  if (!canRead || (course.commentsMode === "hidden" && !isOwner)) return null;

  return (
    <section aria-labelledby="comments-title" className="space-y-4">
      <h2 id="comments-title" className="flex items-center gap-2 font-semibold">
        <MessageSquare className="size-4 text-muted" /> Commentaires
        {comments.length ? (
          <span className="font-normal text-muted">({comments.length})</span>
        ) : null}
      </h2>

      {canWrite ? (
        <Composer placeholder="Ajouter un commentaire" onSubmit={(body) => post(body, null)} />
      ) : (
        <p className="text-[13px] text-muted">
          Les commentaires sont en lecture seule pour cette formation.
        </p>
      )}

      <div className="space-y-4">
        {roots.map((root) => (
          <div key={root.id} className="rounded-card border border-line p-4">
            <CommentItem
              comment={root}
              staff={staff}
              canDelete={isOwner || root.authorUid === user?.uid}
              onReply={canWrite ? () => setReplyTo(root.id) : undefined}
            />
            {(replies.get(root.id)?.length || replyTo === root.id) && (
              <div className="ml-4 mt-4 space-y-4 border-l border-line pl-4">
                {replies.get(root.id)?.map((reply) => (
                  <CommentItem
                    key={reply.id}
                    comment={reply}
                    staff={staff}
                    canDelete={isOwner || reply.authorUid === user?.uid}
                  />
                ))}
                {replyTo === root.id ? (
                  <div className="flex gap-2">
                    <CornerDownRight className="mt-2.5 size-4 shrink-0 text-muted" />
                    <div className="flex-1">
                      <Composer
                        placeholder="Répondre"
                        autoFocus
                        onSubmit={(body) => post(body, root.id)}
                        onCancel={() => setReplyTo(null)}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {!loading && roots.length === 0 ? (
          <p className="text-[13px] text-muted">
            Aucun commentaire pour l&apos;instant. Pose la première question !
          </p>
        ) : null}
      </div>
    </section>
  );
}
