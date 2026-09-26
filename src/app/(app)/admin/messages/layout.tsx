import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatShell } from "@/components/chat/chat-shell";

export const metadata: Metadata = { title: "Messages" };

export default function AdminMessagesLayout({ children }: { children: ReactNode }) {
  return <ChatShell side="school">{children}</ChatShell>;
}
