"use client";

import { collection, limit, orderBy, query, where } from "firebase/firestore";
import { RefreshCw, Tag } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  formatPrice,
  parsePriceInput,
  promoCodeInput,
  promoLabel,
  sameStripeMode,
  type OrderDoc,
  type PromoCodeDoc,
} from "@shared/payments";
import { routes } from "@shared/paths";
import type { TimestampLike } from "@shared/types";
import { useLoadedCourse } from "@/components/course/admin-course-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateCourse, type CourseWithId } from "@/lib/courses";
import {
  callCreatePromoCode,
  callDeactivatePromoCode,
  callSyncPromoCodes,
  errorMessage,
} from "@/lib/firebase/callables";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";
import { useSchoolPayments } from "@/lib/payments";

function PriceCard({ course, stripeActive }: { course: CourseWithId; stripeActive: boolean }) {
  const [value, setValue] = useState(course.price ? String(course.price.amount / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    const amount = trimmed ? parsePriceInput(trimmed) : null;
    if (trimmed && (amount === null || amount < 100 || amount > 1_000_000)) {
      setError("Prix entre 1 € et 10 000 € (ex. 197 ou 197,50)");
      return;
    }
    setSaving(true);
    try {
      await updateCourse(course.id, { price: amount ? { amount, currency: "eur" } : null });
      toast.success(
        amount ? `Prix enregistré : ${formatPrice(amount)}` : "Vente directe désactivée",
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prix</CardTitle>
        {course.price ? <Badge tone="success">{formatPrice(course.price.amount)}</Badge> : null}
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
        <form onSubmit={save} className="flex items-end gap-2" noValidate>
          <Field
            label="Prix TTC (€)"
            htmlFor="course-price"
            error={error}
            hint="Laisse vide pour ne pas vendre directement. Paiement unique par carte."
            className="flex-1"
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
          Tes élèves saisissent le code sur la page de paiement Stripe.
        </p>
        {promos.length ? (
          <ul className="divide-y divide-line-soft rounded-md border border-line text-sm">
            {promos.map((promo) => (
              <li key={promo.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Tag className="size-4 text-muted" />
                <span className="font-mono font-semibold">{promo.code}</span>
                <Badge tone="brand">{promoLabel(promo)}</Badge>
                <span className="text-[13px] text-muted">
                  {promo.timesRedeemed}
                  {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""} utilisation
                  {promo.timesRedeemed > 1 ? "s" : ""}
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
                {order.livemode ? null : <Badge tone="info">Test</Badge>}
                {order.status === "refunded" ? <Badge tone="danger">Remboursée</Badge> : null}
              </li>
            ))}
          </ul>
        )}
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
