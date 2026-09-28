"use client";

import { collection, doc, limit, orderBy, query, where } from "firebase/firestore";
import { MessageCircle, MoreHorizontal, Pin, PinOff, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  COMMUNITY_LIMITS,
  sortFeed,
  type CommunityPostDoc,
  type CommunityReplyDoc,
} from "@shared/community";
import type { ProfileDoc, TimestampLike } from "@shared/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  createPost,
  createReply,
  deletePost,
  deleteReply,
  setPinned,
  type Author,
} from "@/lib/community";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatRelative, toDate } from "@/lib/format";
import { useDocData, useQueryData } from "@/lib/hooks";

type Post = CommunityPostDoc<TimestampLike> & { id: string };
type Reply = CommunityReplyDoc<TimestampLike> & { id: string };

function useAuthor(): Author | null {
  const { user } = useAuth();
  const profileRef = useMemo(() => (user ? doc(db, "profiles", user.uid) : null), [user]);
  const { data: profile } = useDocData<ProfileDoc>(profileRef);
  if (!user) return null;
  return {
    authorUid: user.uid,
    authorName: (
      profile?.displayName ||
      user.displayName ||
      user.email?.split("@")[0] ||
      "Membre"
    ).slice(0, 80),
    authorAvatarUrl: profile?.avatarUrl ?? null,
  };
}

function Composer({
  placeholder,
  max,
  onSubmit,
  compact,
  label,
}: {
  placeholder: string;
  max: number;
  onSubmit: (body: string) => Promise<void>;
  compact?: boolean;
  label: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  async function submit() {
    const text = body.trim();
    if (!text) return;
    // Zone vidée tout de suite (le message apparaît en temps réel), rétablie en cas d'erreur.
    setBody("");
    setSending(true);
    try {
      await onSubmit(text);
    } catch (error) {
      setBody(text);
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Textarea
        aria-label={label}
        placeholder={placeholder}
        className={compact ? "min-h-10 flex-1" : "min-h-20 flex-1"}
        maxLength={max}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Button
        type="submit"
        size={compact ? "icon" : "sm"}
        disabled={!body.trim() || sending}
        aria-label={compact ? "Envoyer la réponse" : undefined}
      >
        <Send /> {compact ? null : sending ? "Publication…" : "Publier"}
      </Button>
    </form>
  );
}

function Replies({
  schoolId,
  post,
  staff,
  author,
}: {
  schoolId: string;
  post: Post;
  staff: Set<string>;
  author: Author | null;
}) {
  const repliesQuery = useMemo(
    () =>
      query(
        collection(db, "communities", schoolId, "posts", post.id, "replies"),
        orderBy("createdAt", "asc"),
      ),
    [schoolId, post.id],
  );
  const { data: replies } = useQueryData<CommunityReplyDoc<TimestampLike>>(repliesQuery);
  const isAdmin = Boolean(author && staff.has(author.authorUid));
  return (
    <div className="ml-4 space-y-3 border-l border-line pl-4 sm:ml-12">
      {(replies as Reply[]).map((reply) => (
        <div key={reply.id} className="flex gap-2.5">
          <Avatar name={reply.authorName} src={reply.authorAvatarUrl} size={26} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
              <span className="font-semibold">{reply.authorName}</span>
              {staff.has(reply.authorUid) ? <Badge tone="brand">Formateur</Badge> : null}
              <span className="text-muted">{formatRelative(reply.createdAt)}</span>
            </p>
            <p className="whitespace-pre-line text-[14px]">{reply.body}</p>
          </div>
          {author && (reply.authorUid === author.authorUid || isAdmin) ? (
            <Button
              variant="subtle"
              size="icon"
              aria-label="Supprimer la réponse"
              onClick={() => {
                if (!window.confirm("Supprimer cette réponse ?")) return;
                deleteReply(schoolId, post.id, reply.id).catch((error) =>
                  toast.error(errorMessage(error)),
                );
              }}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      ))}
      {author ? (
        <Composer
          compact
          label="Répondre"
          placeholder="Répondre…"
          max={COMMUNITY_LIMITS.reply}
          onSubmit={(body) => createReply(schoolId, post.id, author, body)}
        />
      ) : null}
    </div>
  );
}

function PostCard({
  schoolId,
  post,
  staff,
  author,
}: {
  schoolId: string;
  post: Post;
  staff: Set<string>;
  author: Author | null;
}) {
  const [open, setOpen] = useState(post.replyCount > 0 && post.replyCount <= 3);
  const isAdmin = Boolean(author && staff.has(author.authorUid));
  const canDelete = Boolean(author && (post.authorUid === author.authorUid || isAdmin));
  return (
    <Card id={`post-${post.id}`} className="scroll-mt-6 space-y-3 p-4">
      <div className="flex gap-3">
        <Avatar name={post.authorName} src={post.authorAvatarUrl} size={36} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
            <span className="font-semibold">{post.authorName}</span>
            {staff.has(post.authorUid) ? <Badge tone="brand">Formateur</Badge> : null}
            {post.pinned ? (
              <Badge tone="info">
                <Pin /> Épinglé
              </Badge>
            ) : null}
            <span className="text-muted">{formatRelative(post.createdAt)}</span>
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-6">{post.body}</p>
        </div>
        {isAdmin || canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="subtle" size="icon" aria-label="Actions du message">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {isAdmin ? (
                <DropdownMenuItem
                  onSelect={() =>
                    setPinned(schoolId, post.id, !post.pinned).catch((error) =>
                      toast.error(errorMessage(error)),
                    )
                  }
                >
                  {post.pinned ? <PinOff /> : <Pin />} {post.pinned ? "Désépingler" : "Épingler"}
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <DropdownMenuItem
                  tone="danger"
                  onSelect={() => {
                    if (!window.confirm("Supprimer ce message et ses réponses ?")) return;
                    deletePost(schoolId, post.id).catch((error) =>
                      toast.error(errorMessage(error)),
                    );
                  }}
                >
                  <Trash2 /> Supprimer
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink sm:ml-12"
      >
        <MessageCircle className="size-4" />
        {post.replyCount
          ? `${post.replyCount} réponse${post.replyCount > 1 ? "s" : ""}`
          : "Répondre"}
      </button>
      {open ? <Replies schoolId={schoolId} post={post} staff={staff} author={author} /> : null}
    </Card>
  );
}

/** Fil de la communauté : publier, répondre, épingler (équipe), supprimer. */
export function CommunityFeed({ schoolId, staff }: { schoolId: string; staff: Set<string> }) {
  const author = useAuthor();
  const recentQuery = useMemo(
    () =>
      query(
        collection(db, "communities", schoolId, "posts"),
        orderBy("createdAt", "desc"),
        limit(COMMUNITY_LIMITS.feed),
      ),
    [schoolId],
  );
  const pinnedQuery = useMemo(
    () => query(collection(db, "communities", schoolId, "posts"), where("pinned", "==", true)),
    [schoolId],
  );
  const { data: recent, loading } = useQueryData<CommunityPostDoc<TimestampLike>>(recentQuery);
  const { data: pinned } = useQueryData<CommunityPostDoc<TimestampLike>>(pinnedQuery);
  const withTime = (posts: Post[]) =>
    posts.map((post) => ({ ...post, at: toDate(post.createdAt)?.getTime() ?? Date.now() }));
  const posts = sortFeed(withTime(pinned as Post[]), withTime(recent as Post[]));

  return (
    <div className="space-y-4">
      {author ? (
        <Card className="p-4">
          <Composer
            label="Nouveau message"
            placeholder="Une question, un projet à partager, une ressource utile…"
            max={COMMUNITY_LIMITS.post}
            onSubmit={(body) => createPost(schoolId, author, body)}
          />
        </Card>
      ) : null}
      {loading ? (
        <Skeleton className="h-40" />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<MessageCircle />}
          title="Aucun message pour l'instant"
          description="Lance la discussion : présente-toi ou partage ce sur quoi tu travailles."
        />
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} schoolId={schoolId} post={post} staff={staff} author={author} />
        ))
      )}
    </div>
  );
}
