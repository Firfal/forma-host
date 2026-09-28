import { z } from "zod";

/**
 * Réglages de vente d'une école (Paramètres > Paiements), creators/{id}/private/sales : écrits
 * par la callable saveSalesSettings (propriétaire), lus par l'équipe et par les Functions.
 */

/** Que faire de l'accès quand une échéance d'un paiement en plusieurs fois est impayée ? */
export type UnpaidPolicy = "end" | "immediate" | "never";

/** Qui établit les factures des ventes ? */
export type InvoicingMode = "platform" | "stripe" | "external";

export interface SalesSettings {
  unpaidPolicy: UnpaidPolicy;
  invoicing: InvoicingMode;
}

export interface SalesSettingsDoc<T = unknown> extends SalesSettings {
  updatedAt: T;
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = { unpaidPolicy: "end", invoicing: "platform" };

export function salesSettingsOf(doc: Partial<SalesSettings> | null | undefined): SalesSettings {
  return {
    unpaidPolicy: doc?.unpaidPolicy ?? DEFAULT_SALES_SETTINGS.unpaidPolicy,
    invoicing: doc?.invoicing ?? DEFAULT_SALES_SETTINGS.invoicing,
  };
}

export const UNPAID_POLICIES: Record<UnpaidPolicy, { label: string; description: string }> = {
  end: {
    label: "Quand Stripe arrête les relances",
    description:
      "L'élève garde l'accès pendant que Stripe relance le paiement ; il le perd si les relances échouent.",
  },
  immediate: {
    label: "Dès l'échéance impayée",
    description:
      "Accès suspendu tout de suite, rétabli automatiquement dès que l'échéance est payée.",
  },
  never: {
    label: "Jamais",
    description:
      "L'élève garde l'accès quoi qu'il arrive ; tu es prévenu pour régler cela avec lui.",
  },
};

export const INVOICING_MODES: Record<InvoicingMode, { label: string; description: string }> = {
  platform: {
    label: "Forma Host établit mes factures",
    description:
      "Factures et avoirs numérotés, à partir de tes informations légales, dans « Mes achats » de l'élève et dans Vente.",
  },
  stripe: {
    label: "Stripe établit mes factures",
    description:
      "Stripe crée la facture de chaque paiement (et de chaque échéance) sur ton compte ; l'élève la retrouve dans « Mes achats ». Service Stripe Invoicing, facturé par Stripe.",
  },
  external: {
    label: "Mon outil de facturation",
    description:
      "Pennylane, Tiime, Quaderno… relié à ton compte Stripe ou alimenté par les Intégrations (vente payée) : Forma Host n'établit aucune facture.",
  },
};

export const salesSettingsInput = z.object({
  unpaidPolicy: z.enum(["end", "immediate", "never"]),
  invoicing: z.enum(["platform", "stripe", "external"]),
});
export type SalesSettingsInput = z.infer<typeof salesSettingsInput>;
