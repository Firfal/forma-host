"use client";

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { FileText, RefreshCw, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  formatPrice,
  INSTALLMENT_OPTIONS,
  installmentLabel,
  MIN_INSTALLMENTS_PRICE_CENTS,
  parsePriceInput,
  promoLabel,
  promoRedemptions,
  sameStripeMode,
  type OrderDoc,
  type PromoCodeDoc,
} from "@shared/payments";
import { promoCodeInput } from "@shared/payments-input";
import { routes } from "@shared/paths";
import type { TimestampLike } from "@shared/types";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { updateCourse, type CourseWithId } from "@/lib/courses";
import {
  callCreatePromoCode,
  callDeactivatePromoCode,
  callIssueMissingInvoices,
  callSyncPromoCodes,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchoolLegal } from "@/lib/legal";
import { useSchoolPayments } from "@/lib/payments";

function PriceCard({ course, stripeActive }: { course: CourseWithId; stripeActive: boolean }) {
  const [value, setValue] = useState(course.price ? String(course.price.amount / 100) : "");
  const [installments, setInstallments] = useState<number[]>(course.price?.installments ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const typed = value.trim() ? parsePriceInput(value.trim()) : null;
  const installmentsAllowed = typed !== null && typed >= MIN_INSTALLMENTS_PRICE_CENTS;

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    const amount = trimmed ? parsePriceInput(trimmed) : null;
    if (trimmed && (amount === null || amount < 100 || amount > 1_000_000)) {
      setError("Prix entre 1 € et 10 000 € (ex. 197 ou 197,50)");
      return;
    }
    const counts = amount && amount >= MIN_INSTALLMENTS_PRICE_CENTS ? [...installments].sort() : [];
    setSaving(true);
    try {
      await updateCourse(course.id, {
        price: amount
          ? { amount, currency: "eur", ...(counts.length ? { installments: counts } : {}) }
          : null,
      });
      toast.success(
        amount ? `Prix enregistré : ${formatPrice(amount)}` : "Vente directe désactivée",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function toggle(count: number, checked: boolean) {
    setInstallments((current) =>
      checked ? [...new Set([...current, count])] : current.filter((value) => value !== count),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prix</CardTitle>
        {course.price ? (
          <Badge tone="success">
            {formatPrice(course.price.amount)}
            {course.price.installments?.length
              ? ` · ${course.price.installments.map((count) => `${count}×`).join(", ")}`
              : ""}
          </Badge>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-3">
        {!stripeActive ? (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
            Relie ton compte Stripe dans{" "}
            <Link href={routes.adminSettings} className="font-medium underline">
              Paramètres
            </Link>{" "}
            pour encaisser en direct. En attendant, le bouton de la page de vente mène au lien de
            paiement externe éventuel (onglet « Page de vente »).
          </p>
        ) : null}
        <form onSubmit={save} className="space-y-4" noValidate>
          <Field
            label="Prix TTC (€)"
            htmlFor="course-price"
            error={error}
            hint="Laisse vide pour ne pas vendre directement."
          >
            <Input
              id="course-price"
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="197"
              className="max-w-40"
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium">
              Paiement en plusieurs fois sans frais
            </legend>
            <p className="text-[13px] text-muted">
              {installmentsAllowed
                ? "Mensualités prélevées automatiquement ; accès dès le premier paiement. Un code promo réduit l'ensemble des échéances (sauf s'il est réservé au paiement en une fois)."
                : "Disponible à partir de 50 €."}
            </p>
            <div className="space-y-1.5">
              {INSTALLMENT_OPTIONS.map((count) => (
                <label
                  key={count}
                  className={cn(
                    "flex items-center gap-2.5 text-sm",
                    !installmentsAllowed && "text-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={installmentsAllowed && installments.includes(count)}
                    disabled={!installmentsAllowed}
                    onChange={(e) => toggle(count, e.target.checked)}
                    className="size-4 accent-ink"
                  />
                  <span className="font-medium">En {count} fois</span>
                  {installmentsAllowed && typed ? (
                    <span className="text-[13px] text-muted">{installmentLabel(typed, count)}</span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

function PromoCodesCard({ course }: { course: CourseWithId }) {
  const promosQuery = useMemo(
    () => query(collection(db, "courses", course.id, "promoCodes"), orderBy("createdAt", "desc")),
    [course.id],
  );
  const { data: promos } = useQueryData<PromoCodeDoc<TimestampLike>>(promosQuery);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [forInstallments, setForInstallments] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    const numeric = kind === "percent" ? Number(value) : parsePriceInput(value);
    const parsed = promoCodeInput.safeParse({
      courseId: course.id,
      code,
      kind,
      value: numeric,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      installments: forInstallments,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Code promo invalide");
      return;
    }
    setBusy("create");
    try {
      await callCreatePromoCode(parsed.data);
      toast.success(`Code ${parsed.data.code} créé`);
      setCode("");
      setValue("");
      setMaxRedemptions("");
      setExpiresAt("");
      setForInstallments(true);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function deactivate(promoId: string, promoCode: string) {
    if (!window.confirm(`Désactiver le code ${promoCode} ?`)) return;
    setBusy(promoId);
    try {
      await callDeactivatePromoCode({ courseId: course.id, promoId });
      toast.success(`Code ${promoCode} désactivé`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy("sync");
    try {
      await callSyncPromoCodes({ courseId: course.id });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Codes promo</CardTitle>
        {promos.length ? (
          <Button variant="subtle" size="sm" onClick={sync} disabled={busy !== null}>
            <RefreshCw className={busy === "sync" ? "animate-spin" : undefined} /> Utilisations
          </Button>
        ) : null}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-[13px] text-muted">
          Tes élèves saisissent le code au moment de commander : le prix remisé (et
          l&apos;échéancier) s&apos;affiche avant le paiement.
        </p>
        {promos.length ? (
          <ul className="divide-y divide-line-soft rounded-md border border-line text-sm">
            {promos.map((promo) => (
              <li key={promo.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Tag className="size-4 text-muted" />
                <span className="font-mono font-semibold">{promo.code}</span>
                <Badge tone="brand">{promoLabel(promo)}</Badge>
                {promo.installments === false ? <Badge>En une fois seulement</Badge> : null}
                <span className="text-[13px] text-muted">
                  {promoRedemptions(promo)}
                  {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""} utilisation
                  {promoRedemptions(promo) > 1 ? "s" : ""}
                  {promo.expiresAt ? ` · jusqu'au ${formatDate(promo.expiresAt)}` : ""}
                </span>
                <span className="ml-auto">
                  {promo.active ? (
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => deactivate(promo.id, promo.code)}
                      disabled={busy !== null}
                    >
                      Désactiver
                    </Button>
                  ) : (
                    <Badge tone="neutral">Désactivé</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Field label="Code" htmlFor="promo-code">
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BIENVENUE"
              maxLength={30}
            />
          </Field>
          <Field label="Réduction" htmlFor="promo-value">
            <div className="flex gap-2">
              <Input
                id="promo-value"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={kind === "percent" ? "20" : "50"}
              />
              <select
                aria-label="Type de réduction"
                value={kind}
                onChange={(e) => setKind(e.target.value as "percent" | "amount")}
                className="h-9 rounded-md border border-line bg-white px-2 text-sm"
              >
                <option value="percent">%</option>
                <option value="amount">€</option>
              </select>
            </div>
          </Field>
          <Field label="Utilisations max (facultatif)" htmlFor="promo-max">
            <Input
              id="promo-max"
              inputMode="numeric"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Valable jusqu'au (facultatif)" htmlFor="promo-expires">
            <Input
              id="promo-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-ink)]"
              checked={forInstallments}
              onChange={(e) => setForInstallments(e.target.checked)}
            />
            Valable aussi en paiement en plusieurs fois
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy !== null || !code.trim() || !value.trim()}>
              {busy === "create" ? "Création…" : "Créer le code"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function OrdersCard({ course, livemode }: { course: CourseWithId; livemode: boolean }) {
  const ordersQuery = useMemo(
    () =>
      query(
        collection(db, "orders"),
        where("schoolId", "==", course.creatorId),
        where("courseId", "==", course.id),
        orderBy("createdAt", "desc"),
        limit(100),
      ),
    [course.creatorId, course.id],
  );
  const { data: orders } = useQueryData<OrderDoc<TimestampLike>>(ordersQuery);
  // Le total ne mélange pas les ventes de test et les ventes réelles.
  const paid = orders.filter(
    (order) => order.status === "paid" && sameStripeMode(order.livemode, livemode),
  );
  const revenue = paid.reduce((sum, order) => sum + order.amount, 0);
  const { data: legal } = useSchoolLegal(course.creatorId);
  const missingInvoices = orders.filter(
    (order) => order.status === "paid" && !order.invoice,
  ).length;
  const [issuing, setIssuing] = useState(false);

  async function issue() {
    setIssuing(true);
    try {
      const { issued } = await callIssueMissingInvoices({ schoolId: course.creatorId });
      toast.success(`${issued} facture${issued > 1 ? "s" : ""} émise${issued > 1 ? "s" : ""}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventes</CardTitle>
        {paid.length ? (
          <span className="text-[13px] text-muted">
            {paid.length} vente{paid.length > 1 ? "s" : ""} · {formatPrice(revenue)}
          </span>
        ) : null}
      </CardHeader>
      <CardBody>
        {orders.length === 0 ? (
          <p className="text-[13px] text-muted">Aucune vente pour le moment.</p>
        ) : (
          <ul className="divide-y divide-line-soft text-sm">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{order.name || order.email}</span>
                <span className="text-[13px] text-muted">{formatDate(order.createdAt)}</span>
                <span className="w-20 text-right font-medium tabular-nums">
                  {formatPrice(order.amount, order.currency)}
                </span>
                {order.installments ? (
                  <Badge
                    tone={
                      order.installments.status === "past_due" ||
                      order.installments.status === "canceled"
                        ? "warning"
                        : "neutral"
                    }
                    title={
                      order.installments.status === "past_due"
                        ? "Échéance impayée : Stripe relance le paiement"
                        : order.installments.status === "canceled"
                          ? "Paiement interrompu : accès retiré"
                          : undefined
                    }
                  >
                    {order.installments.count}× · {order.installments.paidInvoiceIds.length}/
                    {order.installments.count}
                  </Badge>
                ) : null}
                {order.livemode ? null : <Badge tone="info">Test</Badge>}
                {order.status === "refunded" ? <Badge tone="danger">Remboursée</Badge> : null}
                {order.invoice ? (
                  <Link
                    href={routes.invoice(order.id)}
                    className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"
                    title={`Facture ${order.invoice.number}`}
                  >
                    <FileText className="size-3.5" /> Facture
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {missingInvoices ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-surface px-3 py-2.5 text-[13px]">
            <p className="flex-1 text-muted">
              {missingInvoices} vente{missingInvoices > 1 ? "s" : ""} sans facture
              {legal ? "." : " : complète d'abord tes informations légales (Paramètres)."}
            </p>
            {legal ? (
              <Button size="sm" variant="secondary" onClick={issue} disabled={issuing}>
                {issuing ? "Émission…" : "Émettre les factures"}
              </Button>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <Link href={routes.adminSettings}>Paramètres</Link>
              </Button>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default function CourseSalesPage() {
  const course = useLoadedCourse();
  const { active: stripeActive, livemode } = useSchoolPayments(course.creatorId);
  return (
    <div className="max-w-3xl space-y-4">
      <PriceCard course={course} stripeActive={stripeActive} />
      {stripeActive && course.price ? <PromoCodesCard course={course} /> : null}
      <OrdersCard course={course} livemode={livemode} />
    </div>
  );
}
