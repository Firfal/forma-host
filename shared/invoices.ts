import { z } from "zod";
import { vatMention, vatRate, type SchoolLegalInfo } from "./legal";
import { formatPrice } from "./payments";

/**
 * Factures des ventes : numérotées sans trou par école et par année (F-2026-0001), émises au
 * paiement à partir des informations légales de l'école, figées dans la commande. Un
 * remboursement émet un avoir (A-2026-0001).
 */

export type InvoiceSeller = Pick<
  SchoolLegalInfo,
  "companyName" | "legalForm" | "siret" | "address" | "vatMode" | "vatNumber" | "contactEmail"
>;

export interface InvoiceBuyer {
  name: string | null;
  email: string;
  address: string | null;
}

/** orders/{id}.invoice : facture figée à son émission. */
export interface OrderInvoice<T = unknown> {
  number: string;
  issuedAt: T;
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  description: string;
  /** Taux de TVA en % (0 : pas de TVA). */
  vatRate: number;
  /** Montants en centimes. */
  amountExclTax: number;
  vatAmount: number;
  amountInclTax: number;
  vatMention: string;
  /** Modalités de paiement particulières (paiement en plusieurs fois). */
  paymentTerms?: string | null;
  /** Avoir émis au remboursement. */
  creditNote?: { number: string; issuedAt: T } | null;
}

/**
 * Compteurs de numérotation (creators/{id}/private/invoicing), par année. Les ventes de test
 * ont leur propre série (TEST-F-…) pour ne pas créer de trou dans la numérotation réelle.
 */
export interface InvoicingCounters {
  invoices?: Record<string, number>;
  creditNotes?: Record<string, number>;
  testInvoices?: Record<string, number>;
  testCreditNotes?: Record<string, number>;
}

export type InvoiceSeries = "invoices" | "creditNotes" | "testInvoices" | "testCreditNotes";

const SERIES_PREFIX: Record<InvoiceSeries, string> = {
  invoices: "F",
  creditNotes: "A",
  testInvoices: "TEST-F",
  testCreditNotes: "TEST-A",
};

export function invoiceSeries(kind: "invoice" | "creditNote", livemode: boolean): InvoiceSeries {
  if (kind === "invoice") return livemode ? "invoices" : "testInvoices";
  return livemode ? "creditNotes" : "testCreditNotes";
}

export function formatInvoiceNumber(series: InvoiceSeries, year: number, sequence: number): string {
  return `${SERIES_PREFIX[series]}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** Montant TTC → HT et TVA (arrondis au centime, le total TTC est conservé). */
export function invoiceAmounts(amountInclTax: number, rate: number) {
  const amountExclTax = rate ? Math.round((amountInclTax * 100) / (100 + rate)) : amountInclTax;
  return { amountExclTax, vatAmount: amountInclTax - amountExclTax, amountInclTax };
}

export function buildInvoice<T>(params: {
  number: string;
  issuedAt: T;
  legal: SchoolLegalInfo;
  buyer: InvoiceBuyer;
  description: string;
  amountInclTax: number;
  paymentTerms?: string | null;
}): OrderInvoice<T> {
  const rate = vatRate(params.legal);
  return {
    number: params.number,
    issuedAt: params.issuedAt,
    seller: {
      companyName: params.legal.companyName,
      legalForm: params.legal.legalForm,
      siret: params.legal.siret,
      address: params.legal.address,
      vatMode: params.legal.vatMode,
      vatNumber: params.legal.vatNumber,
      contactEmail: params.legal.contactEmail,
    },
    buyer: params.buyer,
    description: params.description,
    vatRate: rate,
    ...invoiceAmounts(params.amountInclTax, rate),
    vatMention: vatMention(params.legal),
    paymentTerms: params.paymentTerms ?? null,
    creditNote: null,
  };
}

/** Adresse postale Stripe (customer_details.address) sur une ligne. */
export function formatPostalAddress(
  address:
    | {
        line1?: string | null;
        line2?: string | null;
        postal_code?: string | null;
        city?: string | null;
        country?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!address) return null;
  const city = [address.postal_code, address.city].filter(Boolean).join(" ");
  const parts = [
    address.line1,
    address.line2,
    city,
    address.country && address.country !== "FR" ? address.country : null,
  ]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export const orderIdInput = z.object({ orderId: z.string().min(1).max(256) });
export type OrderIdInput = z.infer<typeof orderIdInput>;

/** Modalités d'un paiement en plusieurs fois, sur la facture. */
export function installmentTerms(plan: { count: number; first: number; monthly: number }): string {
  const rest = plan.count - 1;
  return `Paiement en ${plan.count} fois sans frais par carte bancaire : ${formatPrice(plan.first)} à la commande, puis ${rest} mensualité${rest > 1 ? "s" : ""} de ${formatPrice(plan.monthly)}.`;
}
