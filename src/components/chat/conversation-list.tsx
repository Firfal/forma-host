"use client";

import { ListFilter, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { routes } from "@shared/paths";
import type { TimestampLike } from "@shared/types";
import { NewConversationDialog } from "@/components/chat/new-conversation-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  lastFromMe,
  useSchoolConversations,
  useStudentConversations,
  type ChatSide,
  type ConversationWithId,
} from "@/lib/chat";
import { cn } from "@/lib/cn";
import { formatDate, formatTime, toDate } from "@/lib/format";
import { useSchool } from "@/lib/school";

/** Aujourd'hui : l'heure ; sinon la date. */
function listDate(value: TimestampLike | null | undefined): string {
  const date = toDate(value);
  if (!date) return "";
  return date.toDateString() === new Date().toDateString() ? formatTime(date) : formatDate(date);
}

function ConversationRow({
  conversation,
  side,
  active,
}: {
  conversation: ConversationWithId;
  side: ChatSide;
  active: boolean;
}) {
  const name = side === "school" ? conversation.studentName : conversation.schoolName;
  const unread = side === "school" ? conversation.unreadForSchool : conversation.unreadForStudent;
  const body = conversation.lastMessage?.body;
  const preview = body
    ? lastFromMe(conversation, side)
      ? `Vous : ${body}`
      : body
    : "Nouvelle conversation";
  const href =
    side === "school"
      ? routes.adminConversation(conversation.id)
      : routes.conversation(conversation.id);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-black/[0.04]",
        active && "bg-black/[0.06] hover:bg-black/[0.06]",
      )}
    >
      <Avatar name={name} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
            {name}
          </span>
          <span className="ml-auto shrink-0 text-[12px] text-muted">
            {listDate(conversation.lastAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-[13px]", unread ? "text-ink" : "text-muted")}>
            {preview}
          </p>
          {unread ? (
            <span
              className="ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white"
              aria-label={`${unread} non lu${unread > 1 ? "s" : ""}`}
            >
              {unread}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/** Liste des conversations : celles de l'école (équipe) ou celles de l'élève. */
export function ConversationList({
  side,
  selectedId,
  className,
}: {
  side: ChatSide;
  selectedId: string | undefined;
  className?: string;
}) {
  const { user } = useAuth();
  const { schoolId } = useSchool();
  const [archived, setArchived] = useState(false);
  const school = useSchoolConversations(side === "school" ? schoolId : null, archived);
  const student = useStudentConversations(side === "student" ? user?.uid : undefined);
  const { data: conversations, loading } = side === "school" ? school : student;

  const empty =
    side === "school"
      ? archived
        ? "Aucune conversation archivée."
        : "Aucune conversation pour l'instant. Tes élèves peuvent t'écrire depuis leurs formations."
      : "Aucun message pour l'instant. Écris à ton formateur depuis la page d'une formation.";

  return (
    <Card className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4">
        <h1 className="text-[15px] font-semibold">Messages</h1>
        {side === "school" ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-muted hover:bg-surface hover:text-ink">
                <ListFilter className="size-3.5" /> {archived ? "Archivées" : "Actives"}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setArchived(false)}>Actives</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setArchived(true)}>Archivées</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <NewConversationDialog className="ml-auto" />
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-3 px-2 py-2">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3.5 w-48" />
              </div>
            </div>
          ))
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center text-[13px] text-muted">
            <MessagesSquare className="mb-3 size-6" />
            <p className="max-w-xs">{empty}</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              side={side}
              active={conversation.id === selectedId}
            />
          ))
        )}
      </div>
    </Card>
  );
}
