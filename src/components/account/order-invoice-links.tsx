import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { routes } from "@shared/paths";
import type { OrderDoc } from "@shared/payments";

const linkClass = "inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink";

/** Facture(s) d'une vente selon qui les établit : Forma Host, Stripe ou l'outil de l'école. */
export function OrderInvoiceLinks({
  order,
}: {
  order: Pick<OrderDoc, "invoice" | "invoicing" | "stripeInvoices"> & { id: string };
}) {
  if (order.invoice) {
    return (
      <Link
        href={routes.invoice(order.id)}
        className={linkClass}
        title={`Facture ${order.invoice.number}`}
      >
        <FileText className="size-3.5" /> Facture
      </Link>
    );
  }
  const stripeInvoices = order.stripeInvoices ?? [];
  if (stripeInvoices.length) {
    return (
      <>
        {stripeInvoices.map((invoice, index) =>
          invoice.url ? (
            <a
              key={invoice.id}
              href={invoice.url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
              title={invoice.number ? `Facture ${invoice.number}` : undefined}
            >
              <ExternalLink className="size-3.5" /> Facture
              {stripeInvoices.length > 1 ? ` ${index + 1}` : ""}
            </a>
          ) : (
            <span key={invoice.id} className="text-[13px] text-muted">
              Facture {invoice.number ?? "Stripe"}
            </span>
          ),
        )}
      </>
    );
  }
  if (order.invoicing === "external") {
    return <span className="text-[13px] text-muted">Facture envoyée par l&apos;école</span>;
  }
  return null;
}
