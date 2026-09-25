"use client";

import { doc, getDoc } from "firebase/firestore";
import {
  AlertTriangle,
  ExternalLink,
  FileUp,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { formatDuration } from "@shared/outline";
import { removeItem } from "@shared/outline-edit";
import { routes, storagePaths } from "@shared/paths";
import { lessonLinkSchema } from "@shared/schemas";
import { parseVimeoUrl, vimeoPageUrl } from "@shared/vimeo";
import type { LessonAttachment, LessonDoc, LessonLink, RichText, VimeoVideo } from "@shared/types";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { ImageUpload } from "@/components/course/image-upload";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { PageContainer } from "@/components/layout/page";
import { VimeoPlayer } from "@/components/video/vimeo-player";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { saveLesson, saveOutline } from "@/lib/courses";
import { callResolveVimeoVideo, errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { deleteFile, formatFileSize, uploadProtectedFile } from "@/lib/storage";

const MAX_ATTACHMENT_MB = 100;

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

interface Draft {
  title: string;
  isPreview: boolean;
  hidden: boolean;
  video: VimeoVideo | null;
  thumbnailUrl: string | null;
  body: RichText | null;
  links: LessonLink[];
  attachments: LessonAttachment[];
}

export default function LessonEditorPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const course = useLoadedCourse();
  const router = useRouter();
  const item = course.items.find((i) => i.id === lessonId && i.kind === "lesson");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoWarning, setVideoWarning] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const removedPaths = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // Chargement unique : l'édition locale ne doit pas être écrasée par le temps réel.
  useEffect(() => {
    if (!item || draft) return;
    getDoc(doc(db, "courses", course.id, "lessons", lessonId))
      .then((snap) => {
        const lesson = snap.data() as LessonDoc | undefined;
        setDraft({
          title: item.title,
          isPreview: Boolean(item.isPreview),
          hidden: Boolean(item.hidden),
          video: lesson?.video ?? null,
          thumbnailUrl: lesson?.thumbnailUrl ?? null,
          body: lesson?.body ?? null,
          links: lesson?.links ?? [],
          attachments: lesson?.attachments ?? [],
        });
      })
      .catch((error) => toast.error(errorMessage(error)));
  }, [course.id, lessonId, item, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!item) {
    return (
      <PageContainer>
        <EmptyState
          title="Leçon introuvable"
          description="Elle a peut-être été supprimée du plan."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.adminCourseContent(course.id)}>Retour au contenu</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
  };

  async function attachVideo() {
    const ref = parseVimeoUrl(videoUrl);
    if (!ref) {
      setVideoWarning("Lien Vimeo non reconnu. Exemple : https://vimeo.com/123456789/abcdef1234");
      return;
    }
    setVideoWarning(null);
    update({
      video: { provider: "vimeo", ...ref, title: null, durationSec: null, thumbnailUrl: null },
    });
    setVideoUrl("");
    setResolving(true);
    try {
      const video = await callResolveVimeoVideo({ url: vimeoPageUrl(ref) });
      update({ video });
      if (draft?.title === "Nouvelle leçon" && video.title) update({ title: video.title });
    } catch (error) {
      setVideoWarning(
        `Durée et miniature non récupérées. ${errorMessage(error)} La vidéo reste utilisable si son intégration est autorisée sur ce domaine.`,
      );
    } finally {
      setResolving(false);
    }
  }

  async function onAttachment(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const tooBig = files.find((file) => file.size > MAX_ATTACHMENT_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`« ${tooBig.name} » dépasse ${MAX_ATTACHMENT_MB} Mo.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded: LessonAttachment[] = [];
      for (const file of files) {
        const path = await uploadProtectedFile(
          (fileName) => storagePaths.lessonAttachment(course.id, lessonId, fileName),
          file,
        );
        uploaded.push({
          name: file.name,
          path,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        });
      }
      update({ attachments: [...(draft?.attachments ?? []), ...uploaded] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft) return;
    const links = draft.links.filter((link) => link.label.trim() || link.url.trim());
    for (const link of links) {
      const result = lessonLinkSchema.safeParse(link);
      if (!result.success) {
        toast.error(`Lien « ${link.label || link.url} » : ${result.error.issues[0]?.message}`);
        return;
      }
    }
    setSaving(true);
    try {
      await saveLesson(
        course.id,
        lessonId,
        {
          video: draft.video,
          thumbnailUrl: draft.thumbnailUrl,
          body: draft.body,
          links,
          attachments: draft.attachments,
        },
        {
          title: draft.title.trim() || "Sans titre",
          isPreview: draft.isPreview,
          hidden: draft.hidden,
          durationSec: draft.video?.durationSec ?? null,
        },
      );
      await Promise.allSettled(removedPaths.current.map(deleteFile));
      removedPaths.current = [];
      setDirty(false);
      toast.success("Leçon enregistrée");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeLesson() {
    if (!window.confirm(`Supprimer la leçon « ${item!.title} » ?`)) return;
    try {
      await saveOutline(course.id, course.outlineVersion, removeItem(course.items, lessonId));
      setDirty(false);
      router.replace(routes.adminCourseContent(course.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <PageContainer width="wide">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 truncate text-[13px] text-muted">
            <Link href={routes.adminCourses} className="hover:text-ink">
              Formations
            </Link>{" "}
            /{" "}
            <Link href={routes.adminCourseContent(course.id)} className="hover:text-ink">
              {course.title}
            </Link>{" "}
            / Leçon
          </div>
          <h1 className="text-lg font-semibold">Modifier la leçon</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? (
            <span className="text-[13px] text-muted">Modifications non enregistrées</span>
          ) : null}
          <Button asChild variant="ghost">
            <Link href={routes.adminCourseContent(course.id)}>Fermer</Link>
          </Button>
          <Button onClick={save} disabled={!draft || saving || !dirty}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </header>

      {!draft ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-96" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Card>
              <CardBody>
                <label htmlFor="lesson-title" className="sr-only">
                  Titre de la leçon
                </label>
                <input
                  id="lesson-title"
                  value={draft.title}
                  maxLength={200}
                  onChange={(e) => update({ title: e.target.value })}
                  className="w-full rounded-md px-1 py-1 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-brand-logo/25"
                  placeholder="Titre de la leçon"
                />
              </CardBody>
            </Card>

            <Section title="Vidéo" icon={<Video />}>
              {draft.video ? (
                <div className="space-y-3">
                  <VimeoPlayer video={draft.video} title={draft.title} />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
                    <span className="flex items-center gap-2">
                      {resolving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                      Vimeo #{draft.video.id}
                      {draft.video.durationSec
                        ? ` · ${formatDuration(draft.video.durationSec)}`
                        : ""}
                    </span>
                    <span className="flex gap-1">
                      <Button asChild variant="subtle" size="sm">
                        <a href={vimeoPageUrl(draft.video)} target="_blank" rel="noreferrer">
                          <ExternalLink /> Ouvrir sur Vimeo
                        </a>
                      </Button>
                      <Button variant="subtle" size="sm" onClick={() => update({ video: null })}>
                        <X /> Retirer
                      </Button>
                    </span>
                  </div>
                </div>
              ) : (
                <Field
                  label="Lien de la vidéo Vimeo"
                  htmlFor="vimeo-url"
                  hint="Vidéo « masquée de Vimeo », intégration autorisée sur ton domaine. Colle le lien de partage (avec son code) ou le code d'intégration."
                >
                  <div className="flex gap-2">
                    <Input
                      id="vimeo-url"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void attachVideo();
                        }
                      }}
                      placeholder="https://vimeo.com/123456789/abcdef1234"
                    />
                    <Button variant="secondary" onClick={attachVideo} disabled={!videoUrl.trim()}>
                      Ajouter
                    </Button>
                  </div>
                </Field>
              )}
              {videoWarning ? (
                <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {videoWarning}
                </p>
              ) : null}
              <Field label="Miniature personnalisée" hint="Sinon, la miniature Vimeo est utilisée.">
                <ImageUpload
                  value={draft.thumbnailUrl}
                  onChange={(thumbnailUrl) => update({ thumbnailUrl })}
                  pathFor={(fileName) =>
                    storagePaths.lessonThumbnail(course.id, lessonId, fileName)
                  }
                  hint="PNG, JPEG, GIF ou WEBP, 5 Mo max."
                />
              </Field>
            </Section>

            <Section title="Description" icon={<FileUp />}>
              <RichTextEditor
                value={draft.body}
                onChange={(body) => update({ body })}
                placeholder="Ce que l'élève va apprendre, les consignes, les ressources…"
              />
            </Section>

            <Section title="Liens" icon={<Link2 />}>
              {draft.links.length === 0 ? (
                <p className="text-[13px] text-muted">
                  Discord, prise de rendez-vous, ressources externes…
                </p>
              ) : null}
              {draft.links.map((link, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label="Libellé"
                    placeholder="Libellé (ex. Discord)"
                    value={link.label}
                    className="sm:w-48"
                    onChange={(e) =>
                      update({
                        links: draft.links.map((l, i) =>
                          i === index ? { ...l, label: e.target.value } : l,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label="Adresse"
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) =>
                      update({
                        links: draft.links.map((l, i) =>
                          i === index ? { ...l, url: e.target.value } : l,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="subtle"
                    size="icon"
                    aria-label="Retirer le lien"
                    onClick={() => update({ links: draft.links.filter((_, i) => i !== index) })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => update({ links: [...draft.links, { label: "", url: "" }] })}
                disabled={draft.links.length >= 50}
              >
                <Plus /> Ajouter un lien
              </Button>
            </Section>

            <Section title="Pièces jointes" icon={<Paperclip />}>
              {draft.attachments.length === 0 ? (
                <p className="text-[13px] text-muted">
                  Fichiers de projet, PDF, presets… Téléchargeables uniquement par les élèves
                  inscrits.
                </p>
              ) : (
                <ul className="divide-y divide-line-soft rounded-md border border-line">
                  {draft.attachments.map((attachment) => (
                    <li key={attachment.path} className="flex items-center gap-3 px-3 py-2">
                      <Paperclip className="size-4 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <span className="text-[12px] text-muted">
                        {formatFileSize(attachment.size)}
                      </span>
                      <Button
                        variant="subtle"
                        size="icon"
                        aria-label={`Retirer ${attachment.name}`}
                        onClick={() => {
                          removedPaths.current.push(attachment.path);
                          update({
                            attachments: draft.attachments.filter(
                              (a) => a.path !== attachment.path,
                            ),
                          });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
                {uploading ? "Envoi…" : "Ajouter des fichiers"}
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={onAttachment}
              />
            </Section>
          </div>

          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>Options</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-medium">Aperçu gratuit</span>
                  <span className="block text-[13px] text-muted">
                    Visible sans inscription, depuis la page de vente.
                  </span>
                </span>
                <Switch
                  checked={draft.isPreview}
                  onCheckedChange={(isPreview) => update({ isPreview })}
                />
              </label>
              <label className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-medium">Masquée</span>
                  <span className="block text-[13px] text-muted">
                    Invisible pour les élèves (brouillon).
                  </span>
                </span>
                <Switch checked={draft.hidden} onCheckedChange={(hidden) => update({ hidden })} />
              </label>
              <div className="space-y-1 border-t border-line-soft pt-3">
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link href={routes.lesson(course.id, lessonId)}>
                    <ExternalLink /> Voir la leçon
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-danger"
                  onClick={removeLesson}
                >
                  <Trash2 /> Supprimer la leçon…
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}
