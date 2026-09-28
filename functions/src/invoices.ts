import { Timestamp } from "firebase-admin/firestore";
import {
  buildInvoice,
  formatInvoiceNumber,
  installmentTerms,
  invoiceSeries,
  type InvoicingCounters,
  type OrderInvoice,
} from "@shared/invoices";
import type { SchoolLegalDoc } from "@shared/legal";
import type { OrderDoc } from "@shared/payments";
import type { CourseDoc } from "@shared/types";
import { db } from "./db";

/**
 * Factures et avoirs des ventes. La numérotation est tenue par transaction (sans trou ni doublon,
 * même si le webhook Stripe est rejoué) ; la facture est figée dans la commande.
 */

export class InvoiceError extends Error {}

const counterRef = (schoolId: string) => db().doc(`creators/${schoolId}/private/invoicing`);

/** Émet la facture d'une commande payée (idempotent). null : informations légales manquantes. */
export async function issueInvoice(orderId: string): Promise<OrderInvoice | null> {
  const orderRef = db().doc(`orders/${orderId}`);
  return db().runTransaction(async (tx) => {
    const order = (await tx.get(orderRef)).data() as OrderDoc<Timestamp> | undefined;
    if (!order) throw new InvoiceError("Commande introuvable.");
    if (order.invoice) return order.invoice;
    const [legalSnap, courseSnap, countersSnap] = await Promise.all([
      tx.get(db().doc(`creators/${order.schoolId}/legal/info`)),
      tx.get(db().doc(`courses/${order.courseId}`)),
      tx.get(counterRef(order.schoolId)),
    ]);
    const legal = legalSnap.data() as SchoolLegalDoc | undefined;
    if (!legal) return null;
    const course = courseSnap.data() as CourseDoc | undefined;
    const counters = (countersSnap.data() ?? {}) as InvoicingCounters;
    const issuedAt = Timestamp.now();
    const year = issuedAt.toDate().getFullYear();
    const series = invoiceSeries("invoice", Boolean(order.livemode));
    const sequence = (counters[series]?.[year] ?? 0) + 1;
    const invoice = buildInvoice({
      number: formatInvoiceNumber(series, year, sequence),
      issuedAt,
      legal,
      buyer: { name: order.name, email: order.email, address: order.billingAddress ?? null },
      description: `Formation en ligne : ${course?.title ?? "formation"}`,
      amountInclTax: order.amount,
      paymentTerms: order.installments ? installmentTerms(order.installments) : null,
    });
    tx.set(counterRef(order.schoolId), { [series]: { [year]: sequence } }, { merge: true });
    tx.update(orderRef, { invoice });
    return invoice;
  });
}

/** Avoir d'une commande remboursée qui avait une facture (idempotent). */
export async function issueCreditNote(orderId: string): Promise<void> {
  const orderRef = db().doc(`orders/${orderId}`);
  await db().runTransaction(async (tx) => {
    const order = (await tx.get(orderRef)).data() as OrderDoc<Timestamp> | undefined;
    if (!order?.invoice || order.invoice.creditNote) return;
    const counters = ((await tx.get(counterRef(order.schoolId))).data() ?? {}) as InvoicingCounters;
    const issuedAt = Timestamp.now();
    const year = issuedAt.toDate().getFullYear();
    const series = invoiceSeries("creditNote", Boolean(order.livemode));
    const sequence = (counters[series]?.[year] ?? 0) + 1;
    tx.set(counterRef(order.schoolId), { [series]: { [year]: sequence } }, { merge: true });
    tx.update(orderRef, {
      "invoice.creditNote": { number: formatInvoiceNumber(series, year, sequence), issuedAt },
    });
  });
}

/** Factures des ventes passées avant la saisie des informations légales. */
export async function issueMissingInvoices(schoolId: string): Promise<number> {
  const orders = await db()
    .collection("orders")
    .where("schoolId", "==", schoolId)
    .where("status", "==", "paid")
    .get();
  let issued = 0;
  // Dans l'ordre des ventes, pour une numérotation chronologique.
  // Ventes dont la facture revient à Stripe ou à l'outil du formateur : ignorées.
  const pending = orders.docs
    .filter((doc) => {
      const order = doc.data() as OrderDoc;
      return !order.invoice && (order.invoicing ?? "platform") === "platform";
    })
    .sort(
      (a, b) =>
        ((a.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0) -
        ((b.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0),
    );
  for (const doc of pending) {
    if (await issueInvoice(doc.id)) issued += 1;
  }
  return issued;
}
