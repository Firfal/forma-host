"use client";

import { doc } from "firebase/firestore";
import { ArrowLeft, Printer } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import type { OrderInvoice } from "@shared/invoices";
import { formatPrice, type OrderDoc } from "@shared/payments";
import type { TimestampLike } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format";
import { useDocData } from "@/lib/hooks";

function Amount({ cents }: { cents: number }) {
  return <>{formatPrice(cents)}</>;
}

function InvoiceDocument({
  invoice,
  order,
}: {
  invoice: OrderInvoice<TimestampLike>;
  order: OrderDoc<TimestampLike>;
}) {
  const seller = invoice.seller;
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-line bg-white p-8 text-[13px] leading-5 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none md:p-12">
      {order.livemode ? null : (
        <p className="mb-6 rounded-md bg-info-soft px-3 py-2 text-info">
          Facture de test : aucun paiement réel.
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-base font-semibold">{seller.companyName}</p>
          <p className="text-muted">{seller.legalForm}</p>
          <p>{seller.address}</p>
          <p>
            {seller.siret.length === 14 ? "SIRET" : "SIREN"} {seller.siret}
          </p>
          {seller.vatNumber && seller.vatMode === "standard" ? <p>TVA {seller.vatNumber}</p> : null}
          <p>{seller.contactEmail}</p>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold tracking-tight">Facture</h1>
          <p className="font-medium">N° {invoice.number}</p>
          <p className="text-muted">Émise le {formatDate(invoice.issuedAt)}</p>
        </div>
      </header>

      <section className="mt-8">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Facturé à</p>
        {invoice.buyer.name ? <p className="font-medium">{invoice.buyer.name}</p> : null}
        <p>{invoice.buyer.email}</p>
        {invoice.buyer.address ? <p>{invoice.buyer.address}</p> : null}
      </section>

      <table className="mt-8 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[12px] uppercase tracking-wide text-muted">
            <th className="py-2 font-semibold">Désignation</th>
            <th className="py-2 text-right font-semibold">Qté</th>
            <th className="py-2 text-right font-semibold">Prix HT</th>
            <th className="py-2 text-right font-semibold">TVA</th>
            <th className="py-2 text-right font-semibold">Total TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-line-soft align-top">
            <td className="py-3 pr-4">{invoice.description}</td>
            <td className="py-3 text-right tabular-nums">1</td>
            <td className="py-3 text-right tabular-nums">
              <Amount cents={invoice.amountExclTax} />
            </td>
            <td className="py-3 text-right tabular-nums">{invoice.vatRate} %</td>
            <td className="py-3 text-right tabular-nums">
              <Amount cents={invoice.amountInclTax} />
            </td>
          </tr>
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-full max-w-64 space-y-1 tabular-nums">
        <div className="flex justify-between">
          <dt className="text-muted">Total HT</dt>
          <dd>
            <Amount cents={invoice.amountExclTax} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">TVA ({invoice.vatRate} %)</dt>
          <dd>
            <Amount cents={invoice.vatAmount} />
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold">
          <dt>Total TTC</dt>
          <dd>
            <Amount cents={invoice.amountInclTax} />
          </dd>
        </div>
      </dl>

      <footer className="mt-10 space-y-1 border-t border-line-soft pt-4 text-[12px] text-muted">
        {invoice.paymentTerms ? (
          <p>
            {invoice.paymentTerms} Commande du {formatDate(order.createdAt)}.
          </p>
        ) : (
          <p>
            Payée le {formatDate(order.createdAt)} par carte bancaire (Stripe)
            {order.promoCode ? `, code promo ${order.promoCode}` : ""}.
          </p>
        )}
        {invoice.vatRate === 0 ? <p>{invoice.vatMention}</p> : null}
      </footer>

      {invoice.creditNote ? (
        <section className="mt-8 rounded-md border border-line p-4">
          <p className="font-semibold">Avoir N° {invoice.creditNote.number}</p>
          <p className="text-muted">
            Émis le {formatDate(invoice.creditNote.issuedAt)}, en remboursement de la facture{" "}
            {invoice.number} : <Amount cents={-invoice.amountInclTax} /> TTC.
          </p>
        </section>
      ) : null}
    </article>
  );
}

/** Facture d'une commande (acheteur ou équipe de l'école), imprimable en PDF. */
export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const ref = useMemo(() => doc(db, "orders", orderId), [orderId]);
  const { data: order, loading, error } = useDocData<OrderDoc<TimestampLike>>(ref);

  return (
    <div className="min-h-dvh bg-surface px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft /> Retour
        </Button>
        {order?.invoice ? (
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Télécharger en PDF
          </Button>
        ) : null}
      </div>
      {loading ? (
        <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-line bg-white p-8">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-40" />
        </div>
      ) : !order || error ? (
        <p className="text-center text-sm text-muted">Commande introuvable.</p>
      ) : order.invoice ? (
        <InvoiceDocument invoice={order.invoice} order={order} />
      ) : (
        <p className="mx-auto max-w-md text-center text-sm text-muted">
          La facture de cette commande n&apos;est pas encore disponible : l&apos;école doit
          d&apos;abord compléter ses informations légales.
        </p>
      )}
    </div>
  );
}
