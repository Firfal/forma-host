"use client";

import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useAnnouncements } from "@/lib/announcements";
import { formatDate, toDate } from "@/lib/format";

const WEEK = 7 * 86_400_000;

/** Dernières annonces de l'école sur la page de la formation (élève). */
export function CourseAnnouncements({ courseId }: { courseId: string }) {
  const { data: announcements } = useAnnouncements(courseId, 3);
  if (!announcements.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="size-4 text-muted" /> Annonces
        </CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="space-y-4">
          {announcements.map((announcement) => {
            const recent = (toDate(announcement.createdAt)?.getTime() ?? 0) > Date.now() - WEEK;
            return (
              <li key={announcement.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{announcement.title}</p>
                  {recent ? <Badge tone="brand">Nouveau</Badge> : null}
                  <span className="text-[12px] text-muted">
                    {formatDate(announcement.createdAt)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-ink/85">
                  {announcement.body}
                </p>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
