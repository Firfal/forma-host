"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  BellOff,
  SendHorizontal,
  Star,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { MESSAGE_MAX } from "@shared/chat";
import { routes } from "@shared/paths";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  groupMessages,
  markConversationRead,
  sendMessage,
  useConversation,
  useMessages,
  type ChatSide,
  type ConversationWithId,
  type MessageWithId,
} from "@/lib/chat";
import { cn } from "@/lib/cn";
import { callUpdateConversation, errorMessage } from "@/lib/firebase/callables";
import { formatDate, formatTime, memberSeniority } from "@/lib/format";

function IconAction({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      variant="subtle"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(active && "bg-surface text-ink")}
    >
      {children}
    </Button>
  );
}

function DaySeparator({ day }: { day: Date }) {
  return (
    <div className="flex items-center gap-2 py-3" role="separator">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-muted">{formatDate(day)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function MessageItem({
  message,
  showHeader,
  conversation,
}: {
  message: MessageWithId;
  showHeader: boolean;
  conversation: ConversationWithId;
}) {
  const fromStudent = message.authorUid === conversation.studentUid;
  const seniority = memberSeniority(conversation.studentSince);
  return (
    <div className={cn("-mx-2 rounded-md px-2", showHeader ? "mt-2 py-1" : "py-0.5")}>
      {showHeader ? (
        <div className="flex flex-wrap items-center gap-2">
          <Avatar name={message.authorName} size={28} />
          <span className="text-sm font-medium">{message.authorName}</span>
          {fromStudent ? (
            <Badge tone="info">
              <Star className="fill-current" /> {seniority.label}
            </Badge>
          ) : (
            <Badge tone="brand">
              <BadgeCheck /> Créateur
            </Badge>
          )}
          <span className="text-[12px] text-muted">
            {formatTime(message.createdAt ?? new Date())}
          </span>
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words pl-9 text-sm leading-6">{message.body}</p>
    </div>
  );
}

function Composer({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [body, setBody] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Hauteur ajustée au contenu (jusqu'à ~6 lignes).
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [body]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text) return;
    // Vidé tout de suite (le message s'affiche en temps réel), restauré en cas d'erreur.
    setBody("");
    try {
      await onSend(text);
    } catch (error) {
      setBody(text);
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={submit} className="shrink-0 px-4 pb-4 md:px-5">
      <div className="flex items-end gap-1 rounded-md border border-line bg-white py-1 pl-3 pr-1 focus-within:border-ink/40">
        <textarea
          ref={inputRef}
          rows={1}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Entrée envoie, Maj+Entrée va à la ligne.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Message"
          aria-label="Message"
          maxLength={MESSAGE_MAX}
          className="max-h-40 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-muted"
        />
        <Button
          type="submit"
          variant="subtle"
          size="icon"
          aria-label="Envoyer"
          disabled={!body.trim()}
        >
          <SendHorizontal />
        </Button>
      </div>
    </form>
  );
}

/** Fil d'une conversation, vu par l'équipe de l'école ou par l'élève. */
export function ChatThread({ side, conversationId }: { side: ChatSide; conversationId: string }) {
  const { user } = useAuth();
  const { data: conversation, loading, error } = useConversation(conversationId);
  const { data: messages, loading: messagesLoading } = useMessages(
    conversation ? conversationId : undefined,
  );
  const groups = useMemo(() => groupMessages(messages), [messages]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const unread = conversation
    ? side === "school"
      ? conversation.unreadForSchool
      : conversation.unreadForStudent
    : 0;

  // Toujours sur le dernier message.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [messages.length, conversationId]);

  // Conversation ouverte et visible = lue (compteur et notification de la cloche), y compris
  // quand on revient sur l'onglet après un message reçu en arrière-plan.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  useEffect(() => {
    if (!user) return;
    const markRead = () => {
      const current = conversationRef.current;
      if (!current || document.visibilityState !== "visible") return;
      markConversationRead(current, side, user.uid).catch(() => undefined);
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [conversation?.id, unread, side, user]);

  const listHref = side === "school" ? routes.adminMessages : routes.messages;

  if (loading || (conversation && messagesLoading && !messages.length)) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col p-5">
        <Skeleton className="mb-6 h-5 w-40" />
        <Skeleton className="mb-3 h-12 w-2/3" />
        <Skeleton className="h-12 w-1/2" />
      </Card>
    );
  }
  if (!conversation || error) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="font-semibold">Conversation introuvable</p>
        <Button asChild variant="link" className="mt-2">
          <Link href={listHref}>Retour aux messages</Link>
        </Button>
      </Card>
    );
  }

  const title = side === "school" ? conversation.studentName : conversation.schoolName;
  const muted = Boolean(user && conversation.mutedBy?.includes(user.uid));

  async function update(change: { archived?: boolean; blocked?: boolean; muted?: boolean }) {
    try {
      await callUpdateConversation({ conversationId, ...change });
      if (change.archived !== undefined) {
        toast.success(change.archived ? "Conversation archivée" : "Conversation désarchivée");
      } else if (change.blocked !== undefined) {
        toast.success(
          change.blocked ? "L'élève ne peut plus écrire" : "L'élève peut de nouveau écrire",
        );
      } else {
        toast.success(change.muted ? "Notifications coupées" : "Notifications réactivées");
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function send(body: string) {
    if (!user) return;
    await sendMessage(
      conversationId,
      { uid: user.uid, name: user.displayName || user.email || "Membre" },
      body,
    );
  }

  const blockedForMe = side === "student" && conversation.blocked;

  return (
    <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 md:px-5">
        <Button asChild variant="subtle" size="icon" className="md:hidden">
          <Link href={listHref} aria-label="Retour aux conversations">
            <ArrowLeft />
          </Link>
        </Button>
        <h2 className="min-w-0 truncate text-[15px] font-semibold">{title}</h2>
        <div className="ml-auto flex shrink-0 gap-0.5">
          {side === "school" ? (
            <>
              <IconAction
                label={conversation.blocked ? "Débloquer l'élève" : "Bloquer l'élève"}
                active={conversation.blocked}
                onClick={() => {
                  if (
                    !conversation.blocked &&
                    !window.confirm(`Bloquer ${title} ? L'élève ne pourra plus t'écrire.`)
                  ) {
                    return;
                  }
                  void update({ blocked: !conversation.blocked });
                }}
              >
                <Ban />
              </IconAction>
              <IconAction
                label={conversation.archived ? "Désarchiver" : "Archiver"}
                active={conversation.archived}
                onClick={() => void update({ archived: !conversation.archived })}
              >
                {conversation.archived ? <ArchiveRestore /> : <Archive />}
              </IconAction>
            </>
          ) : null}
          <IconAction
            label={muted ? "Réactiver les notifications" : "Couper les notifications"}
            active={muted}
            onClick={() => void update({ muted: !muted })}
          >
            {muted ? <BellOff /> : <Bell />}
          </IconAction>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-5">
        <div className="flex min-h-full flex-col justify-end">
          {groups.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">
              {side === "school"
                ? `Écris le premier message à ${conversation.studentName}.`
                : `Pose ta question à l'équipe de ${conversation.schoolName}.`}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.day.getTime()}>
                <DaySeparator day={group.day} />
                {group.items.map(({ message, showHeader }) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    showHeader={showHeader}
                    conversation={conversation}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>

      {side === "school" && conversation.blocked ? (
        <p className="mx-4 mb-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning md:mx-5">
          Conversation bloquée : l&apos;élève ne peut plus t&apos;écrire.
        </p>
      ) : null}
      {blockedForMe ? (
        <p className="shrink-0 border-t border-line px-5 py-4 text-center text-[13px] text-muted">
          L&apos;école a fermé cette conversation.
        </p>
      ) : (
        <Composer onSend={send} />
      )}
    </Card>
  );
}
