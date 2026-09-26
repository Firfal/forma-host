"use client";

import { collection, limit, orderBy, query } from "firebase/firestore";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { CreatorRequestDoc } from "@shared/creator-requests";
import { schoolSlugSchema } from "@shared/school";
import type { TimestampLike } from "@shared/types";
import { PageContainer } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  callApproveCreatorRequest,
  callRejectCreatorRequest,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

type Request = CreatorRequestDoc<TimestampLike> & { id: string };

function PendingRequest({ request }: { request: Request }) {
  const [slug, setSlug] = useState(request.slug);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function approve() {
    const parsed = schoolSlugSchema.safeParse(slug);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Adresse invalide");
      return;
    }
    setBusy(true);
    try {
      await callApproveCreatorRequest({ uid: request.uid, slug: parsed.data });
      toast.success(`« ${request.schoolName} » est créée`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await callRejectCreatorRequest({ uid: request.uid, reason: reason.trim() || null });
      toast.success("Demande refusée");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{request.schoolName}</p>
            <p className="text-[13px] text-muted">
              {request.displayName} · {request.email} · {formatDate(request.createdAt)}
            </p>
          </div>
          <Badge tone="warning">En attente</Badge>
        </div>
        {request.message ? (
          <p className="whitespace-pre-line rounded-md bg-surface px-3 py-2 text-[13px]">
            {request.message}
          </p>
        ) : null}
        <Field label="Adresse publique" htmlFor={`slug-${request.id}`}>
          <Input
            id={`slug-${request.id}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="max-w-xs"
          />
        </Field>
        {rejecting ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field
              label="Motif (envoyé au demandeur)"
              htmlFor={`reason-${request.id}`}
              className="flex-1"
            >
              <Input
                id={`reason-${request.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
              />
            </Field>
            <Button variant="danger" onClick={reject} disabled={busy}>
              Confirmer le refus
            </Button>
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              Annuler
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button onClick={approve} disabled={busy}>
              {busy ? "Création…" : "Accepter et créer l'école"}
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
              Refuser
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function PlatformRequestsPage() {
  const { isPlatformAdmin } = useAuth();
  const requestsQuery = useMemo(
    () =>
      isPlatformAdmin
        ? query(collection(db, "creatorRequests"), orderBy("createdAt", "desc"), limit(100))
        : null,
    [isPlatformAdmin],
  );
  const { data: requests, loading } = useQueryData<CreatorRequestDoc<TimestampLike>>(requestsQuery);
  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending");

  if (!isPlatformAdmin) {
    return (
      <PageContainer>
        <EmptyState
          title="Réservé aux administrateurs de la plateforme"
          description="Cette page sert à valider les demandes d'espace formateur."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader title="Demandes d'espace formateur" />
      <div className="space-y-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : pending.length === 0 ? (
          <EmptyState
            title="Aucune demande en attente"
            description="Les nouvelles demandes apparaîtront ici (et dans tes notifications)."
          />
        ) : (
          pending.map((request) => <PendingRequest key={request.id} request={request} />)
        )}

        {decided.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Demandes traitées</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="divide-y divide-line-soft text-sm">
                {decided.map((request) => (
                  <li key={request.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <strong>{request.schoolName}</strong>{" "}
                      <span className="text-muted">· {request.email}</span>
                    </span>
                    {request.status === "approved" ? (
                      <Badge tone="success">Acceptée</Badge>
                    ) : (
                      <Badge tone="danger">Refusée</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
