"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { routes } from "@shared/paths";
import { resolveSalesPage } from "@shared/sales-page";
import type { SalesPage } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import {
  getCourseSettings,
  saveCourseSettings,
  updateCourse,
  type CourseWithId,
} from "@/lib/courses";
import { useCreator } from "@/lib/creator";
import { errorMessage } from "@/lib/firebase/callables";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="block">
        <CardTitle>{title}</CardTitle>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </CardHeader>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

export function SalesPageEditor({ course }: { course: CourseWithId }) {
  const { data: creator } = useCreator(course.creatorId);
  const [page, setPage] = useState<SalesPage | null>(null);
  const [ctaUrl, setCtaUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!creator || page) return;
    setPage(resolveSalesPage(course, creator.name));
    getCourseSettings(course.id)
      .then((settings) => setCtaUrl(settings.externalCtaUrl ?? ""))
      .catch(() => undefined);
  }, [creator, course, page]);

  if (!page || !creator) return <p className="text-muted">Chargement…</p>;

  const update = (patch: Partial<SalesPage>) =>
    setPage((current) => (current ? { ...current, ...patch } : current));
  const salesPath = routes.salesPage(creator.slug, course.slug);

  async function save() {
    if (!page) return;
    const url = ctaUrl.trim();
    if (url && !/^https:\/\//.test(url)) {
      toast.error("Le lien de paiement doit commencer par https://");
      return;
    }
    setSaving(true);
    try {
      await Promise.all([
        updateCourse(course.id, { salesPage: page }),
        saveCourseSettings(course.id, { externalCtaUrl: url || null }),
      ]);
      toast.success("Page de vente enregistrée (visible d'ici une minute)");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0 text-[13px]">
          <p className="font-medium">Adresse publique</p>
          <p className="truncate text-muted">{salesPath}</p>
        </div>
        {course.status === "published" ? (
          <Button asChild variant="secondary" size="sm">
            <a href={salesPath} target="_blank" rel="noreferrer">
              <ExternalLink /> Voir la page
            </a>
          </Button>
        ) : (
          <p className="text-[13px] text-warning">
            Publie la formation pour rendre la page visible.
          </p>
        )}
      </Card>

      <Section
        title="En-tête"
        description="Le haut de page : c'est ce que les visiteurs voient en premier."
      >
        <Field
          label="Bandeau (optionnel)"
          htmlFor="announcement"
          hint="Ex. « Offre de lancement jusqu'au 30 juin »"
        >
          <Input
            id="announcement"
            value={page.announcement}
            onChange={(e) => update({ announcement: e.target.value })}
            maxLength={140}
          />
        </Field>
        <Field label="Titre accrocheur" htmlFor="headline">
          <Input
            id="headline"
            value={page.headline}
            onChange={(e) => update({ headline: e.target.value })}
            maxLength={160}
          />
        </Field>
        <Field label="Sous-titre" htmlFor="subheadline">
          <Textarea
            id="subheadline"
            value={page.subheadline}
            onChange={(e) => update({ subheadline: e.target.value })}
            maxLength={300}
            className="min-h-16"
          />
        </Field>
        <p className="text-[13px] text-muted">
          La vidéo du haut de page est celle de la première leçon en « aperçu gratuit » (sinon la
          miniature).
        </p>
      </Section>

      <Section
        title="Bouton d'achat"
        description="Sans paiement intégré en V1 : le bouton mène vers ton lien de paiement (Stripe, PayPal, Systeme.io…). Tu donnes ensuite l'accès depuis l'onglet Élèves."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Texte du bouton" htmlFor="cta">
            <Input
              id="cta"
              value={page.ctaLabel}
              onChange={(e) => update({ ctaLabel: e.target.value })}
              maxLength={60}
            />
          </Field>
          <Field label="Prix affiché (optionnel)" htmlFor="price" hint="Ex. « 194 € ou 3 × 70 € »">
            <Input
              id="price"
              value={page.priceLabel}
              onChange={(e) => update({ priceLabel: e.target.value })}
              maxLength={80}
            />
          </Field>
        </div>
        <Field
          label="Lien de paiement"
          htmlFor="cta-url"
          hint="Sans lien, le bouton mène à l'espace de la formation (connexion requise)."
        >
          <Input
            id="cta-url"
            type="url"
            placeholder="https://buy.stripe.com/…"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
          />
        </Field>
      </Section>

      <Section title="À propos du formateur">
        <Field label="Titre" htmlFor="about-title">
          <Input
            id="about-title"
            value={page.aboutTitle}
            onChange={(e) => update({ aboutTitle: e.target.value })}
            maxLength={120}
          />
        </Field>
        <Field
          label="Présentation"
          htmlFor="about-text"
          hint="Laisse vide pour masquer cette section."
        >
          <Textarea
            id="about-text"
            value={page.aboutText}
            onChange={(e) => update({ aboutText: e.target.value })}
            maxLength={2000}
          />
        </Field>
      </Section>

      <Section title="Témoignages">
        {page.testimonials.map((testimonial, index) => (
          <div key={index} className="space-y-2 rounded-md border border-line p-3">
            <div className="flex gap-2">
              <Input
                aria-label="Nom"
                placeholder="Nom (ex. Pierre, élève 2024)"
                value={testimonial.name}
                onChange={(e) =>
                  update({
                    testimonials: page.testimonials.map((t, i) =>
                      i === index ? { ...t, name: e.target.value } : t,
                    ),
                  })
                }
              />
              <Button
                variant="subtle"
                size="icon"
                aria-label="Retirer le témoignage"
                onClick={() =>
                  update({ testimonials: page.testimonials.filter((_, i) => i !== index) })
                }
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              aria-label="Témoignage"
              placeholder="Ce que l'élève a dit…"
              value={testimonial.quote}
              className="min-h-16"
              onChange={(e) =>
                update({
                  testimonials: page.testimonials.map((t, i) =>
                    i === index ? { ...t, quote: e.target.value } : t,
                  ),
                })
              }
            />
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          disabled={page.testimonials.length >= 12}
          onClick={() => update({ testimonials: [...page.testimonials, { name: "", quote: "" }] })}
        >
          <Plus /> Ajouter un témoignage
        </Button>
      </Section>

      <Section title="Questions fréquentes">
        {page.faq.map((item, index) => (
          <div key={index} className="space-y-2 rounded-md border border-line p-3">
            <div className="flex gap-2">
              <Input
                aria-label="Question"
                placeholder="Question"
                value={item.question}
                onChange={(e) =>
                  update({
                    faq: page.faq.map((f, i) =>
                      i === index ? { ...f, question: e.target.value } : f,
                    ),
                  })
                }
              />
              <Button
                variant="subtle"
                size="icon"
                aria-label="Retirer la question"
                onClick={() => update({ faq: page.faq.filter((_, i) => i !== index) })}
              >
                <Trash2 />
              </Button>
            </div>
            <Textarea
              aria-label="Réponse"
              placeholder="Réponse"
              value={item.answer}
              className="min-h-16"
              onChange={(e) =>
                update({
                  faq: page.faq.map((f, i) => (i === index ? { ...f, answer: e.target.value } : f)),
                })
              }
            />
          </div>
        ))}
        <Button
          variant="secondary"
          size="sm"
          disabled={page.faq.length >= 20}
          onClick={() => update({ faq: [...page.faq, { question: "", answer: "" }] })}
        >
          <Plus /> Ajouter une question
        </Button>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-line-soft bg-white/90 px-1 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
}
