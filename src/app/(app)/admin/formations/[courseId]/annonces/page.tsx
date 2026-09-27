"use client";

import { Mail, Megaphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { publishAnnouncementInput } from "@shared/announcements";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { useAnnouncements } from "@/lib/announcements";
import { callPublishAnnouncement, errorMessage } from "@/lib/firebase/callables";
import { formatDateTime } from "@/lib/format";

type Errors = Partial<Record<"title" | "body", string>>;

export default function CourseAnnouncementsPage() {
  const course = useLoadedCourse();
  const { data: announcements } = useAnnouncements(course.id);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  async function publish(event: FormEvent) {
    event.preventDefault();
    const parsed = publishAnnouncementInput.safeParse({
      courseId: course.id,
      title,
      body,
      sendEmail,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    if (
      sendEmail &&
      !window.confirm("Envoyer aussi cette annonce par email à tous les élèves inscrits ?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const { recipients } = await callPublishAnnouncement(parsed.data);
      toast.success(
        recipients
          ? `Annonce publiée : ${recipients} élève${recipients > 1 ? "s" : ""} prévenu${recipients > 1 ? "s" : ""}`
          : "Annonce publiée (aucun élève inscrit pour le moment)",
      );
      setTitle("");
      setBody("");
      setSendEmail(false);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nouvelle annonce</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={publish} className="space-y-4" noValidate>
            <p className="text-[13px] text-muted">
              Nouveau module, live, changement de programme… Tes élèves la voient sur la page de la
              formation et reçoivent une notification.
            </p>
            <Field label="Titre" htmlFor="announcement-title" error={errors.title}>
              <Input
                id="announcement-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrors((current) => ({ ...current, title: undefined }));
                }}
                maxLength={120}
                placeholder="Nouveau module : les expressions"
              />
            </Field>
            <Field label="Message" htmlFor="announcement-body" error={errors.body}>
              <Textarea
                id="announcement-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setErrors((current) => ({ ...current, body: undefined }));
                }}
                maxLength={5000}
                rows={5}
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="mt-0.5 size-4 accent-ink"
              />
              <span>
                <span className="font-medium">Envoyer aussi par email</span>
                <span className="block text-muted">
                  Avec ton adresse d&apos;envoi (Paramètres). À réserver aux annonces importantes.
                </span>
              </span>
            </label>
            <Button type="submit" disabled={busy}>
              <Megaphone /> {busy ? "Publication…" : "Publier l'annonce"}
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Annonces publiées</CardTitle>
        </CardHeader>
        <CardBody>
          {announcements.length === 0 ? (
            <EmptyState
              icon={<Megaphone />}
              title="Aucune annonce"
              description="Tes annonces apparaîtront ici et sur la page de la formation."
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {announcements.map((announcement) => (
                <li key={announcement.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{announcement.title}</p>
                    {announcement.emailed ? (
                      <Badge tone="info">
                        <Mail /> Email
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-[13px] text-muted">
                    {announcement.body}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {formatDateTime(announcement.createdAt)} · {announcement.recipients} élève
                    {announcement.recipients > 1 ? "s" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
