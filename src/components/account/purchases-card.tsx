"use client";

import { collection, query, where } from "firebase/firestore";
import { useMemo } from "react";
import { formatPrice, type OrderDoc } from "@shared/payments";
import type { TimestampLike } from "@shared/types";
import { OrderInvoiceLinks } from "@/components/account/order-invoice-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase/client";
import { formatDate, toDate } from "@/lib/format";
import { useQueryData } from "@/lib/hooks";

/** Achats de l'élève (commandes à son email) avec leurs factures. */
export function PurchasesCard() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;
  const ordersQuery = useMemo(
    () => (email ? query(collection(db, "orders"), where("email", "==", email)) : null),
    [email],
  );
  const { data } = useQueryData<OrderDoc<TimestampLike>>(ordersQuery);
  const orders = [...data].sort(
    (a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0),
  );
  if (!orders.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes achats</CardTitle>
      </CardHeader>
      <CardBody>
        <ul className="divide-y divide-line-soft text-sm">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="min-w-0 flex-1 truncate font-medium">
                {order.courseTitle ?? order.invoice?.description ?? "Formation"}
              </span>
              <span className="text-[13px] text-muted">{formatDate(order.createdAt)}</span>
              <span className="tabular-nums">{formatPrice(order.amount, order.currency)}</span>
              {order.installments && order.status !== "refunded" ? (
                <Badge
                  tone={order.installments.status === "past_due" ? "warning" : "neutral"}
                  title={
                    order.installments.status === "past_due"
                      ? "Échéance impayée : vérifie ta carte bancaire"
                      : undefined
                  }
                >
                  {order.installments.paidInvoiceIds.length}/{order.installments.count} échéances
                </Badge>
              ) : null}
              {order.status === "refunded" ? <Badge tone="danger">Remboursé</Badge> : null}
              <OrderInvoiceLinks order={order} />
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
