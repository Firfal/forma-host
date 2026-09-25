"use client";

import Papa from "papaparse";
import { FileSpreadsheet, Loader2, UserPlus } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { GRANT_ACCESS_BATCH_MAX } from "@shared/constants";
import { parseInviteText, parseStudentRows, type ParsedStudent } from "@shared/import";
import type { GrantAccessResult } from "@shared/schemas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { callGrantAccess, errorMessage } from "@/lib/firebase/callables";

type Mode = "invite" | "import";

function summary(result: GrantAccessResult): string {
  const parts = [];
  if (result.created)
    parts.push(
      `${result.created} élève${result.created > 1 ? "s" : ""} ajouté${result.created > 1 ? "s" : ""}`,
    );
  if (result.reactivated)
    parts.push(`${result.reactivated} réactivé${result.reactivated > 1 ? "s" : ""}`);
  if (result.alreadyEnrolled)
    parts.push(`${result.alreadyEnrolled} déjà inscrit${result.alreadyEnrolled > 1 ? "s" : ""}`);
  return parts.join(" · ") || "Aucun changement";
}

export function GrantAccessDialog({
  courseId,
  courseTitle,
}: {
  courseId: string;
  courseTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("invite");
  const [text, setText] = useState("");
  const [imported, setImported] = useState<{
    fileName: string;
    students: ParsedStudent[];
    invalid: string[];
  } | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed =
    mode === "invite"
      ? parseInviteText(text)
      : { students: imported?.students ?? [], invalid: imported?.invalid ?? [] };

  function reset() {
    setText("");
    setImported(null);
    setProgress(null);
    setSendEmail(true);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (result) => {
        const rows = parseStudentRows(result.data);
        if (!rows.emailColumnFound) {
          toast.error("Aucune colonne d'emails trouvée dans ce fichier.");
          return;
        }
        setImported({ fileName: file.name, students: rows.students, invalid: rows.invalid });
      },
      error: (error) => toast.error(error.message),
    });
  }

  async function submit() {
    const students = parsed.students;
    if (students.length === 0) return;
    const total: GrantAccessResult = { created: 0, reactivated: 0, alreadyEnrolled: 0, errors: [] };
    setProgress({ done: 0, total: students.length });
    try {
      for (let i = 0; i < students.length; i += GRANT_ACCESS_BATCH_MAX) {
        const batch = students.slice(i, i + GRANT_ACCESS_BATCH_MAX);
        const result = await callGrantAccess({
          courseId,
          source: mode,
          sendEmail,
          students: batch,
        });
        total.created += result.created;
        total.reactivated += result.reactivated;
        total.alreadyEnrolled += result.alreadyEnrolled;
        total.errors.push(...result.errors);
        setProgress({ done: Math.min(i + batch.length, students.length), total: students.length });
      }
      if (total.errors.length) {
        toast.warning(
          `${summary(total)} · ${total.errors.length} erreur(s) : ${total.errors[0].email} — ${total.errors[0].message}`,
        );
      } else {
        toast.success(summary(total));
      }
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(errorMessage(error));
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Donner l&apos;accès
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Donner l'accès"
        description={`Formation : ${courseTitle}`}
        className="max-w-xl"
      >
        <div
          className="mb-4 inline-flex rounded-md border border-line p-0.5 text-[13px]"
          role="tablist"
        >
          {(
            [
              ["invite", "Inviter par email"],
              ["import", "Importer un CSV"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "rounded px-3 py-1 font-medium text-muted",
                mode === value && "bg-surface text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "invite" ? (
          <Field
            label="Emails"
            htmlFor="invite-emails"
            hint="Un élève par ligne : « anne@exemple.fr », « Anne Martin <anne@exemple.fr> » ou « anne@exemple.fr, Anne Martin »."
          >
            <Textarea
              id="invite-emails"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"anne@exemple.fr\nLaure Petit <laure@exemple.fr>"}
              className="min-h-32 font-mono text-[13px]"
              disabled={busy}
            />
          </Field>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-muted">
              Export Podia (Audience → Export) ou tout CSV avec une colonne <strong>email</strong>.
              Colonnes reconnues aussi : nom / name, prénom, date d&apos;inscription / signed up
              (conservée).
            </p>
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
              <FileSpreadsheet /> {imported ? "Choisir un autre fichier" : "Choisir un fichier CSV"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
            />
            {imported ? (
              <p className="text-[13px]">
                <strong>{imported.fileName}</strong> : {imported.students.length} élève
                {imported.students.length > 1 ? "s" : ""} détecté
                {imported.students.length > 1 ? "s" : ""}.
              </p>
            ) : null}
          </div>
        )}

        {parsed.invalid.length ? (
          <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
            Ignoré{parsed.invalid.length > 1 ? "s" : ""} : {parsed.invalid.slice(0, 5).join(", ")}
            {parsed.invalid.length > 5 ? `… (+${parsed.invalid.length - 5})` : ""}
          </p>
        ) : null}

        <label className="mt-4 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--color-ink)]"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
            disabled={busy}
          />
          <span>
            Envoyer l&apos;email de bienvenue
            <span className="block text-[13px] text-muted">
              Avec un lien d&apos;activation (30 jours) pour les nouveaux comptes. Décoche pour
              préparer une migration en silence : tu pourras renvoyer l&apos;accès plus tard.
            </span>
          </span>
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          {progress ? (
            <span className="mr-auto flex items-center gap-2 text-[13px] text-muted">
              <Loader2 className="size-3.5 animate-spin" /> {progress.done} / {progress.total}
            </span>
          ) : null}
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || parsed.students.length === 0}>
            {parsed.students.length > 1
              ? `Donner l'accès à ${parsed.students.length} élèves`
              : "Donner l'accès"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
