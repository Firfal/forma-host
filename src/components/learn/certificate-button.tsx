"use client";

import { Award } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { certificateNameError } from "@shared/certificates";
import { routes } from "@shared/paths";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { callIssueCertificate, errorMessage } from "@/lib/firebase/callables";

/** Formation terminée : obtenir (ou revoir) son certificat de réussite. */
export function CertificateButton({
  courseId,
  certificateId,
}: {
  courseId: string;
  certificateId: string | null | undefined;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (certificateId) {
    return (
      <Button asChild variant="secondary" className="w-full">
        <Link href={routes.certificate(certificateId)}>
          <Award /> Voir mon certificat
        </Link>
      </Button>
    );
  }

  async function issue(event: FormEvent) {
    event.preventDefault();
    const nameError = certificateNameError(name);
    if (nameError) {
      setError(nameError);
      return;
    }
    setBusy(true);
    try {
      const { id } = await callIssueCertificate({ courseId, name: name.trim() });
      toast.success("Bravo, ton certificat est prêt !");
      router.push(routes.certificate(id));
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Award /> Obtenir mon certificat
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Ton certificat de réussite"
        description="Formation terminée : bravo ! Vérifie le nom qui sera imprimé sur ton certificat."
      >
        <form onSubmit={issue} className="space-y-4" noValidate>
          <Field label="Nom sur le certificat" htmlFor="certificate-name" error={error}>
            <Input
              id="certificate-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              maxLength={80}
              autoComplete="name"
            />
          </Field>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Création…" : "Créer mon certificat"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
