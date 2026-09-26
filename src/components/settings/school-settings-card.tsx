"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { routes, storagePaths } from "@shared/paths";
import { schoolProfileInput } from "@shared/school";
import { slugify } from "@shared/slug";
import { ImageUpload } from "@/components/course/image-upload";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { brand } from "@/lib/brand";
import { useCreator } from "@/lib/creator";
import { callUpdateSchoolProfile, errorMessage } from "@/lib/firebase/callables";
import { useSchool } from "@/lib/school";

interface SchoolForm {
  name: string;
  slug: string;
  logoUrl: string | null;
  brandColor: string;
  supportEmail: string;
}

type Errors = Partial<Record<keyof SchoolForm, string>>;

const appHost = (() => {
  try {
    return new URL(brand.appUrl).host;
  } catch {
    return brand.appUrl;
  }
})();

/** Profil public de l'école : nom, adresse, logo, couleur, email de support. */
export function SchoolSettingsCard() {
  const { schoolId } = useSchool();
  const { data: creator, loading } = useCreator(schoolId);
  const [form, setForm] = useState<SchoolForm | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (form || loading || !creator) return;
    setForm({
      name: creator.name,
      slug: creator.slug,
      logoUrl: creator.logoUrl,
      brandColor: creator.brandColor,
      supportEmail: creator.supportEmail ?? "",
    });
  }, [form, loading, creator]);

  if (!form || !schoolId) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-40" />
        </CardBody>
      </Card>
    );
  }

  function update<K extends keyof SchoolForm>(key: K, value: SchoolForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const parsed = schoolProfileInput.safeParse({
      ...form,
      supportEmail: form.supportEmail.trim() || null,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof SchoolForm;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    try {
      await callUpdateSchoolProfile({ ...parsed.data, schoolId });
      update("slug", parsed.data.slug);
      toast.success("École enregistrée");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const slugChanged = creator && form.slug !== creator.slug;

  return (
    <Card>
      <CardHeader>
        <CardTitle>École</CardTitle>
        {creator ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.creatorPage(creator.slug)} target="_blank">
              <ExternalLink /> Voir la page publique
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardBody>
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de l'école" htmlFor="school-name" error={errors.name}>
              <Input
                id="school-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={80}
              />
            </Field>
            <Field
              label="Adresse publique"
              htmlFor="school-slug"
              error={errors.slug}
              hint={
                slugChanged
                  ? "Les anciens liens redirigeront vers la nouvelle adresse."
                  : "Page qui liste tes formations."
              }
            >
              <div className="flex items-center rounded-md border border-line focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-brand-logo/25">
                <span className="truncate pl-3 text-[13px] text-muted">{appHost}/</span>
                <input
                  id="school-slug"
                  value={form.slug}
                  onChange={(e) => update("slug", e.target.value)}
                  onBlur={(e) => update("slug", slugify(e.target.value) || e.target.value)}
                  className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm focus:outline-none"
                />
              </div>
            </Field>
          </div>

          <Field label="Logo">
            <ImageUpload
              value={form.logoUrl}
              onChange={(url) => update("logoUrl", url)}
              pathFor={(fileName) => storagePaths.creatorLogo(schoolId, fileName)}
              label="Choisir un logo"
              hint="Carré de préférence, PNG ou JPEG, 2 Mo max."
              maxMb={2}
              previewClassName="size-24"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Couleur de la marque"
              htmlFor="school-color"
              error={errors.brandColor}
              hint="Boutons de la page de vente et des emails."
            >
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Choisir la couleur"
                  value={/^#[0-9a-f]{6}$/i.test(form.brandColor) ? form.brandColor : "#9d72f9"}
                  onChange={(e) => update("brandColor", e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-md border border-line bg-white p-1"
                />
                <Input
                  id="school-color"
                  value={form.brandColor}
                  onChange={(e) => update("brandColor", e.target.value)}
                  className="font-mono"
                  maxLength={7}
                />
              </div>
            </Field>
            <Field
              label="Email de support"
              htmlFor="school-support"
              error={errors.supportEmail}
              hint="Adresse de réponse des emails envoyés à tes élèves."
            >
              <Input
                id="school-support"
                type="email"
                value={form.supportEmail}
                onChange={(e) => update("supportEmail", e.target.value)}
                placeholder="contact@ecolemotion.com"
              />
            </Field>
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
