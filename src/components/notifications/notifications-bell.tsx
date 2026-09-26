"use client";

import { collection, doc, limit, orderBy, query, updateDoc, writeBatch } from "firebase/firestore";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  GraduationCap,
  MessageSquare,
  MessagesSquare,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { NotificationDoc, NotificationType } from "@shared/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { db } from "@/lib/firebase/client";
import { formatRelative } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

const icons: Record<NotificationType, typeof Bell> = {
  new_student: UserPlus,
  new_comment: MessageSquare,
  comment_reply: MessageSquare,
  team_member: Users,
  creator_request: GraduationCap,
  creator_request_decision: BadgeCheck,
  new_message: MessagesSquare,
};

export function NotificationsBell({ className }: { className?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const notificationsQuery = useMemo(
    () =>
      user
        ? query(
            collection(db, "users", user.uid, "notifications"),
            orderBy("createdAt", "desc"),
            limit(20),
          )
        : null,
    [user],
  );
  const { data: notifications } = useQueryData<NotificationDoc>(notificationsQuery);
  const unread = notifications.filter((notification) => !notification.read);

  async function open(notification: NotificationDoc & { id: string }) {
    if (!user) return;
    if (!notification.read) {
      await updateDoc(doc(db, "users", user.uid, "notifications", notification.id), { read: true });
    }
    router.push(notification.link);
  }

  async function markAllRead() {
    if (!user || unread.length === 0) return;
    const batch = writeBatch(db);
    unread.forEach((notification) =>
      batch.update(doc(db, "users", user.uid, "notifications", notification.id), { read: true }),
    );
    await batch.commit();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "relative rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-ink",
          className,
        )}
        aria-label={unread.length ? `Notifications (${unread.length} non lues)` : "Notifications"}
      >
        <Bell className="size-4" />
        {unread.length ? (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread.length ? (
            <button
              type="button"
              className="text-[12px] text-muted hover:text-ink"
              onClick={markAllRead}
            >
              Tout marquer comme lu
            </button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {notifications.length === 0 ? (
            <p className="flex items-center gap-2 px-2.5 py-6 text-[13px] text-muted">
              <BookOpen className="size-4" /> Aucune notification pour le moment.
            </p>
          ) : (
            notifications.map((notification) => {
              const Icon = icons[notification.type] ?? Bell;
              return (
                <DropdownMenuItem
                  key={notification.id}
                  onSelect={() => void open(notification)}
                  className="items-start py-2"
                >
                  <Icon className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate", !notification.read && "font-semibold")}>
                      {notification.title}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {notification.body}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {formatRelative(notification.createdAt)}
                    </span>
                  </span>
                  {!notification.read ? (
                    <span className="mt-1.5 size-2 rounded-full bg-brand-logo" />
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
