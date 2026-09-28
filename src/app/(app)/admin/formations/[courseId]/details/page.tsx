"use client";

import { doc } from "firebase/firestore";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { AssistantSettingsDoc } from "@shared/assistant";
import { richTextToPlain } from "@shared/richtext";
import { isReservedSlug, isValidSlug, slugify } from "@shared/slug";
import { storagePaths } from "@shared/paths";
import type { CommentsMode, CourseVisibility, RichText } from "@shared/types";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { ImageUpload } from "@/components/course/image-upload";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { brand } from "@/lib/brand";
import { isCourseSlugTaken, updateCourse } from "@/lib/courses";
import { useCreator } from "@/lib/creator";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { useDocData } from "@/lib/hooks";

function Choice<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; description: string }[];
}) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 hover:bg-surface/60",
            value === option.value && "border-ink/40 bg-surface/60",
          )}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5 accent-[var(--color-ink)]"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <span className="block font-medium">{option.label}</span>
            <span className="block text-[13px] text-muted">{option.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-5">{children}</CardBody>
    </Card>
  );
}

export default function CourseDetailsPage() {
  const course = useLoadedCourse();
  const { data: creator } = useCreator(course.creatorId);
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [summary, setSummary] = useState(course.summary);
  const [description, setDescription] = useState<RichText | null>(course.description);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(course.thumbnailUrl);
  const [visibility, setVisibility] = useState<CourseVisibility>(course.visibility);
  const [commentsMode, setCommentsMode] = useState<CommentsMode>(course.commentsMode);
  const [certificate, setCertificate] = useState<"on" | "off">(
    course.certificate === false ? "off" : "on",
  );
  const [assistant, setAssistant] = useState<"on" | "off">(course.assistant ? "on" : "off");
  const assistantRef = useMemo(() => doc(db, "platform", "assistant"), []);
  const { data: assistantSettings } = useDocData<AssistantSettingsDoc>(assistantRef);
  const [dripMode, setDripMode] = useState<"none" | "sequential" | "schedule">(
    course.drip?.mode ?? "none",
  );
  const [dripDays, setDripDays] = useState(
    course.drip?.mode === "schedule" ? course.drip.intervalDays : 7,
  );
  const [slugError, setSlugError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const cleanSlug = slug.trim();
    if (!isValidSlug(cleanSlug) || isReservedSlug(cleanSlug)) {
      setSlugError(
        "Lettres minuscules, chiffres et tirets uniquement (ex. maitriser-after-effects).",
      );
      return;
    }
    setSaving(true);
    setSlugError(null);
    try {
      if (
        cleanSlug !== course.slug &&
        (await isCourseSlugTaken(course.creatorId, cleanSlug, course.id))
      ) {
        setSlugError("Cette adresse est déjà utilisée par une autre de tes formations.");
        return;
      }
      await updateCourse(course.id, {
        title: title.trim() || course.title,
        slug: cleanSlug,
        summary: summary.trim() || richTextToPlain(description, 300),
        description,
        thumbnailUrl,
        visibility,
        commentsMode,
        certificate: certificate === "on",
        ...(assistantSettings?.enabled || course.assistant
          ? { assistant: assistant === "on" }
          : {}),
        drip:
          dripMode === "none"
            ? null
            : dripMode === "sequential"
              ? { mode: "sequential" }
              : { mode: "schedule", intervalDays: Math.min(90, Math.max(1, dripDays || 7)) },
      });
      toast.success("Détails enregistrés");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const salesUrl = `${brand.appUrl.replace(/^https?:\/\//, "")}/${creator?.slug ?? "…"}/`;

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-4">
      <Section title="Présentation">
        <Field
          label="Titre"
          htmlFor="title"
          hint="Un titre clair : c'est la première chose que voient tes élèves."
        >
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field label="Adresse de la page de vente" htmlFor="slug" error={slugError}>
          <div className="flex items-center rounded-md border border-line focus-within:ring-2 focus-within:ring-brand-logo/25">
            <span className="hidden truncate pl-3 text-[13px] text-muted sm:block">{salesUrl}</span>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm focus:outline-none sm:pl-0.5"
            />
            <Button
              variant="subtle"
              size="sm"
              className="mr-1"
              onClick={() => setSlug(slugify(title))}
            >
              Depuis le titre
            </Button>
          </div>
        </Field>
        <Field
          label="Résumé"
          htmlFor="summary"
          hint="Une ou deux phrases, affichées sur les cartes et dans les résultats de recherche."
        >
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={300}
            className="min-h-16"
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <RichTextEditor
            id="description"
            value={description}
            onChange={setDescription}
            placeholder="Décris ta formation : pour qui, ce qu'on y apprend, les prérequis…"
          />
        </Field>
        <Field label="Miniature">
          <ImageUpload
            value={thumbnailUrl}
            onChange={setThumbnailUrl}
            pathFor={(fileName) => storagePaths.courseThumbnail(course.id, fileName)}
          />
        </Field>
      </Section>

      <Section title="Disponibilité">
        <Field label="Visibilité">
          <Choice
            name="visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              {
                value: "visible",
                label: "Visible",
                description: "La formation apparaît sur ta page publique une fois publiée.",
              },
              {
                value: "hidden",
                label: "Masquée",
                description:
                  "Accessible uniquement par son lien direct (et pour les élèves inscrits).",
              },
            ]}
          />
        </Field>
        <Field label="Commentaires">
          <Choice
            name="commentsMode"
            value={commentsMode}
            onChange={setCommentsMode}
            options={[
              {
                value: "active",
                label: "Actifs",
                description: "Tout le monde peut lire et répondre.",
              },
              {
                value: "restricted",
                label: "Restreints",
                description: "Tu peux répondre ; les élèves lisent seulement.",
              },
              {
                value: "hidden",
                label: "Masqués",
                description: "Seul toi vois les commentaires existants.",
              },
            ]}
          />
        </Field>
        <Field label="Ouverture des leçons">
          <Choice
            name="drip"
            value={dripMode}
            onChange={setDripMode}
            options={[
              {
                value: "none",
                label: "Tout de suite",
                description: "Toutes les leçons sont ouvertes dès l'inscription.",
              },
              {
                value: "sequential",
                label: "Dans l'ordre",
                description: "Chaque leçon s'ouvre quand l'élève a terminé la précédente.",
              },
              {
                value: "schedule",
                label: "Au fil des semaines",
                description:
                  "Un nouveau chapitre s'ouvre à intervalle régulier après l'inscription.",
              },
            ]}
          />
          {dripMode === "schedule" ? (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span>Un chapitre tous les</span>
              <Input
                type="number"
                min={1}
                max={90}
                value={dripDays}
                onChange={(e) => setDripDays(Number(e.target.value))}
                className="w-20"
                aria-label="Nombre de jours entre deux chapitres"
              />
              <span>jours</span>
            </div>
          ) : null}
        </Field>
        <Field label="Certificat de réussite">
          <Choice
            name="certificate"
            value={certificate}
            onChange={setCertificate}
            options={[
              {
                value: "on",
                label: "Délivré",
                description:
                  "L'élève qui termine toutes les leçons obtient un certificat à ton nom, vérifiable en ligne.",
              },
              {
                value: "off",
                label: "Aucun",
                description: "Pas de certificat pour cette formation.",
              },
            ]}
          />
        </Field>
        {assistantSettings?.enabled ? (
          <Field label="Assistant IA">
            <Choice
              name="assistant"
              value={assistant}
              onChange={setAssistant}
              options={[
                {
                  value: "on",
                  label: "Activé",
                  description:
                    "Sous chaque leçon, les élèves posent leurs questions à un assistant qui répond à partir du contenu de la formation.",
                },
                {
                  value: "off",
                  label: "Désactivé",
                  description: "Pas d'assistant sur cette formation.",
                },
              ]}
            />
          </Field>
        ) : null}
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-line-soft bg-white/90 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
