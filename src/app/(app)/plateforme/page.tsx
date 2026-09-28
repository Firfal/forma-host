"use client";

import { ArrowRight, Globe, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { routes } from "@shared/paths";
import type { PlatformOverview, StripeState } from "@shared/platform";
import { PageContainer } from "@/components/layout/page";
import { AssistantSettingsCard } from "@/components/platform/assistant-settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { callPlatformOverview, errorMessage } from "@/lib/firebase/callables";
import { formatDate, formatRelative } from "@/lib/format";

const euros = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const count = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

const STRIPE_BADGE: Record<
  StripeState,
  { label: string; tone: "success" | "warning" | "neutral" }
> = {
  active: { label: "Paiements actifs", tone: "success" },
  pending: { label: "Stripe à finaliser", tone: "warning" },
  none: { label: "Sans Stripe", tone: "neutral" },
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

/** Vue d'ensemble de la plateforme : écoles, formations, inscriptions et ventes. */
export default function PlatformOverviewPage() {
  const { isPlatformAdmin, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setOverview(await callPlatformOverview({}));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isPlatformAdmin) void load();
  }, [isPlatformAdmin, load]);

  if (!authLoading && !isPlatformAdmin) {
    return (
      <PageContainer>
        <EmptyState
          title="Accès réservé"
          description="Cette page est réservée aux administrateurs de la plateforme."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        title="Vue d'ensemble"
        actions={
          <>
            {overview ? (
              <span className="text-[12px] text-muted">
                Mis à jour {formatRelative(new Date(overview.generatedAt))}
              </span>
            ) : null}
            <Button variant="secondary" size="sm" onClick={load} disabled={refreshing}>
              <RefreshCw className={refreshing ? "animate-spin" : undefined} /> Actualiser
            </Button>
          </>
        }
      />

      {error ? (
        <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
      ) : null}

      {!overview ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {overview.pendingRequests ? (
            <Link
              href={routes.platformRequests}
              className="flex items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] text-warning hover:bg-warning-soft/70"
            >
              <span>
                {overview.pendingRequests} demande
                {overview.pendingRequests > 1 ? "s" : ""} d&apos;espace formateur en attente
              </span>
              <ArrowRight className="size-4" />
            </Link>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Tile label="Écoles" value={count(overview.totals.schools)} />
            <Tile label="Formations publiées" value={count(overview.totals.publishedCourses)} />
            <Tile label="Inscriptions actives" value={count(overview.totals.enrollments)} />
            <Tile label="Ventes" value={count(overview.totals.sales)} />
            <Tile
              label={overview.livemode ? "Chiffre d'affaires" : "CA (ventes de test)"}
              value={euros(overview.totals.revenueCents)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Écoles</CardTitle>
              {!overview.livemode ? <Badge tone="info">Stripe en mode test</Badge> : null}
            </CardHeader>
            <CardBody className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="py-2 font-medium">École</th>
                    <th className="py-2 font-medium">Paiements</th>
                    <th className="py-2 text-right font-medium">Formations</th>
                    <th className="py-2 text-right font-medium">Inscriptions</th>
                    <th className="py-2 text-right font-medium">Ventes</th>
                    <th className="py-2 text-right font-medium">CA</th>
                    <th className="py-2 text-right font-medium">Créée le</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.schools.map((school) => (
                    <tr key={school.id} className="border-b border-line-soft align-top">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={routes.creatorPage(school.slug)}
                          className="font-medium hover:underline"
                        >
                          {school.name}
                        </Link>
                        <span className="flex items-center gap-1 text-[12px] text-muted">
                          {school.domain ? (
                            <>
                              <Globe className="size-3" />
                              {school.domain}
                              {school.domainActive ? "" : " (en cours)"}
                            </>
                          ) : (
                            `/${school.slug}`
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={STRIPE_BADGE[school.stripe].tone}>
                          {STRIPE_BADGE[school.stripe].label}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {school.publishedCourses}
                        <span className="text-muted"> / {school.courses}</span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {count(school.enrollments)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{count(school.sales)}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {euros(school.revenueCents)}
                      </td>
                      <td className="py-2.5 text-right text-muted">
                        {school.createdAt ? formatDate(new Date(school.createdAt)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <AssistantSettingsCard />
        </div>
      )}
    </PageContainer>
  );
}
