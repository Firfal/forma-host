"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { CheckCircle2, Clock, GraduationCap, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { creatorRequestForm, type CreatorRequestDoc } from "@shared/creator-requests";
import { paths, routes } from "@shared/paths";
import { slugify } from "@shared/slug";
import type { TimestampLike } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { errorMessage } from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useDocData } from "@/lib/hooks";

type Errors = Partial<Record<"schoolName" | "slug" | "message", string>>;

const appHost = (() => {
  try {
    return new URL(brand.appUrl).host;
  } catch {
    return brand.appUrl;
  }
})();

function RequestForm({ onSent }: { onSent?: () => void }) {
  const { user } = useAuth();
  const [schoolName, setSchoolName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user?.email) return;
    const parsed = creatorRequestForm.safeParse({ schoolName, slug, message });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSending(true);
    try {
      const taken = await getDocs(
        query(collection(db, "creators"), where("slug", "==", parsed.data.slug), limit(1)),
      );
      if (!taken.empty) {
        setErrors({ slug: "Cette adresse est déjà prise, choisis-en une autre." });
        return;
      }
      await setDoc(doc(db, paths.creatorRequest(user.uid)), {
        uid: user.uid,
        email: user.email,
        displayName: (user.displayName || user.email.split("@")[0]).slice(0, 80),
        schoolName: parsed.data.schoolName,
        slug: parsed.data.slug,
        message: parsed.data.message,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      toast.success("Demande envoyée");
      onSent?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-[13px] text-muted">
            Crée ton école pour héberger tes formations : pages de vente, espace élève, suivi de la
            progression. Chaque demande est validée par l&apos;équipe de {brand.name}.
          </p>
          <Field label="Nom de ton école" htmlFor="request-school" error={errors.schoolName}>
            <Input
              id="request-school"
              value={schoolName}
              maxLength={80}
              onChange={(e) => {
                setSchoolName(e.target.value);
                if (!slugEdited) setSlug(slugify(e.target.value));
                setErrors((current) => ({ ...current, schoolName: undefined, slug: undefined }));
              }}
              placeholder="Studio Motion"
            />
          </Field>
          <Field
            label="Adresse publique souhaitée"
            htmlFor="request-slug"
            error={errors.slug}
            hint="Tu pourras la changer plus tard, ou brancher ton propre domaine."
          >
            <div className="flex items-center rounded-md border border-line focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-brand-logo/25">
              <span className="truncate pl-3 text-[13px] text-muted">{appHost}/</span>
              <input
                id="request-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugEdited(true);
                  setErrors((current) => ({ ...current, slug: undefined }));
                }}
                onBlur={(e) => setSlug(slugify(e.target.value) || e.target.value)}
                className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-sm focus:outline-none"
              />
            </div>
          </Field>
          <Field
            label="Parle-nous de tes formations (facultatif)"
            htmlFor="request-message"
            error={errors.message}
          >
            <Textarea
              id="request-message"
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Thématique, nombre d'élèves, plateforme actuelle…"
            />
          </Field>
          <Button type="submit" disabled={sending || !schoolName.trim()}>
            {sending ? "Envoi…" : "Envoyer ma demande"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function Status({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardBody className="flex gap-3">
        <span className={`mt-0.5 [&_svg]:size-5 ${tone}`}>{icon}</span>
        <div className="space-y-2 text-sm">
          <p className="font-semibold">{title}</p>
          {children}
        </div>
      </CardBody>
    </Card>
  );
}

export default function BecomeCreatorPage() {
  const { user, isCreator } = useAuth();
  const ref = useMemo(() => (user ? doc(db, paths.creatorRequest(user.uid)) : null), [user]);
  const { data: request, loading } = useDocData<CreatorRequestDoc<TimestampLike>>(ref);

  async function retry() {
    if (!ref) return;
    try {
      await deleteDoc(ref);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  let content: ReactNode;
  if (loading) {
    content = <Skeleton className="h-48" />;
  } else if (isCreator) {
    content = (
      <Status icon={<CheckCircle2 />} tone="text-success" title="Tu as un espace formateur">
        <Button asChild>
          <Link href={routes.admin}>Ouvrir mon espace formateur</Link>
        </Button>
      </Status>
    );
  } else if (request?.status === "pending") {
    content = (
      <Status icon={<Clock />} tone="text-warning" title="Demande en cours d'examen">
        <p className="text-muted">
          Demande envoyée le {formatDate(request.createdAt)} pour l&apos;école{" "}
          <strong className="text-ink">« {request.schoolName} »</strong>. Tu recevras une
          notification dès qu&apos;elle aura été examinée.
        </p>
      </Status>
    );
  } else if (request?.status === "approved") {
    content = (
      <Status icon={<CheckCircle2 />} tone="text-success" title="Ton école est prête">
        <p className="text-muted">Activation de ton espace formateur…</p>
      </Status>
    );
  } else if (request?.status === "rejected") {
    content = (
      <Status icon={<XCircle />} tone="text-danger" title="Demande non retenue">
        {request.rejectionReason ? (
          <p className="text-muted">Motif : {request.rejectionReason}</p>
        ) : null}
        <Button variant="secondary" onClick={retry}>
          Refaire une demande
        </Button>
      </Status>
    );
  } else {
    content = <RequestForm />;
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GraduationCap className="size-5" /> Devenir formateur
          </span>
        }
      />
      {content}
    </PageContainer>
  );
}
