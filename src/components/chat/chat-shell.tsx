"use client";

import { MessagesSquare } from "lucide-react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatThread } from "@/components/chat/chat-thread";
import { Card } from "@/components/ui/card";
import type { ChatSide } from "@/lib/chat";
import { cn } from "@/lib/cn";

/**
 * Messagerie en deux volets : liste des conversations et fil. Sur mobile, un seul volet à la fois
 * (la liste, ou la conversation ouverte).
 */
export function ChatShell({ side, children }: { side: ChatSide; children: ReactNode }) {
  const { conversationId } = useParams<{ conversationId?: string }>();
  return (
    <div className="flex h-[calc(100dvh-49px)] gap-5 p-3 md:h-dvh md:p-5 lg:px-8">
      <ConversationList
        side={side}
        selectedId={conversationId}
        className={cn(
          "w-full md:w-80 md:shrink-0 lg:w-[420px]",
          conversationId && "hidden md:flex",
        )}
      />
      <div className={cn("min-w-0 flex-1", conversationId ? "flex" : "hidden md:flex")}>
        {children}
      </div>
    </div>
  );
}

/** Volet de droite quand aucune conversation n'est ouverte. */
export function ChatPlaceholder() {
  return (
    <Card className="flex flex-1 flex-col items-center justify-center p-6 text-center text-muted">
      <MessagesSquare className="mb-3 size-6" />
      <p className="text-[13px]">Choisis une conversation.</p>
    </Card>
  );
}

/** Page d'une conversation : l'identifiant vient de l'adresse. */
export function ChatThreadPage({ side }: { side: ChatSide }) {
  const { conversationId } = useParams<{ conversationId: string }>();
  return <ChatThread key={conversationId} side={side} conversationId={conversationId} />;
}
