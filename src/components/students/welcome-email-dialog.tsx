"use client";

import { Mail, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_WELCOME_EMAIL, WELCOME_EMAIL_VARIABLES } from "@shared/constants";
import { emailLayout, fillTemplate, textToHtml } from "@shared/template";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { brand } from "@/lib/brand";
import { getCourseSettings, saveCourseSettings, type CourseWithId } from "@/lib/courses";
import { useCreator } from "@/lib/creator";
import { callSendTestWelcomeEmail, errorMessage } from "@/lib/firebase/callables";

/** Modèle de l'email de bienvenue d'une formation, avec aperçu et envoi de test. */
export function WelcomeEmailDialog({ course }: { course: CourseWithId }) {
  const { data: creator } = useCreator(course.creatorId);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(DEFAULT_WELCOME_EMAIL.subject);
  const [body, setBody] = useState(DEFAULT_WELCOME_EMAIL.body);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    getCourseSettings(course.id)
      .then((settings) => {
        setSubject(settings.welcomeEmail.subject);
        setBody(settings.welcomeEmail.body);
      })
      .catch((error) => toast.error(errorMessage(error)));
  }, [open, course.id]);

  const vars = useMemo(
    () => ({
      prenom: "Anne",
      formation: course.title,
      formateur: creator?.name ?? brand.name,
      lien: `${brand.appUrl}/formations/${course.id}`,
    }),
    [course.id, course.title, creator?.name],
  );
  const preview = useMemo(
    () =>
      emailLayout({
        bodyHtml: textToHtml(body, vars),
        ctaLabel: "Accéder à la formation",
        ctaUrl: vars.lien,
        brandName: vars.formateur,
        brandColor: creator?.brandColor ?? "#06040e",
      }),
    [body, vars, creator?.brandColor],
  );

  async function save() {
    setSaving(true);
    try {
      await saveCourseSettings(course.id, { welcomeEmail: { subject: subject.trim(), body } });
      toast.success("Email de bienvenue enregistré");
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      if (!(await save())) return;
      const { email } = await callSendTestWelcomeEmail({ courseId: course.id });
      toast.success(`Email de test envoyé à ${email}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Mail /> Email de bienvenue
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Email de bienvenue"
        description="Envoyé à chaque élève à qui tu donnes l'accès. Un bouton vers la formation (ou d'activation du compte) est ajouté automatiquement."
        className="max-w-4xl"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Objet" htmlFor="welcome-subject">
              <Input
                id="welcome-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field
              label="Message"
              htmlFor="welcome-body"
              hint={`Variables : ${WELCOME_EMAIL_VARIABLES.map((v) => `{{${v}}}`).join(", ")}. Laisse une ligne vide entre les paragraphes.`}
            >
              <Textarea
                id="welcome-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-64 text-[13px]"
              />
            </Field>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => {
                setSubject(DEFAULT_WELCOME_EMAIL.subject);
                setBody(DEFAULT_WELCOME_EMAIL.body);
              }}
            >
              <RotateCcw /> Revenir au modèle par défaut
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium">Aperçu</p>
            <p className="truncate rounded-t-md border border-b-0 border-line bg-surface px-3 py-2 text-[13px]">
              <span className="text-muted">Objet : </span>
              {fillTemplate(subject, vars)}
            </p>
            <iframe
              title="Aperçu de l'email"
              srcDoc={preview}
              sandbox=""
              className="-mt-2 h-96 w-full rounded-b-md border border-line"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={sendTest} disabled={testing || saving}>
            <Send /> {testing ? "Envoi…" : "M'envoyer un test"}
          </Button>
          <Button
            onClick={async () => {
              if (await save()) setOpen(false);
            }}
            disabled={saving || !subject.trim() || !body.trim()}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
