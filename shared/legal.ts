import { z } from "zod";
import { emailSchema } from "./schemas";

/**
 * Pages légales d'une école (mentions légales, CGV, politique de confidentialité), générées à
 * partir de ses informations légales (Admin > Paramètres > Informations légales).
 * Modèles indicatifs pour la vente de formations en ligne en France : à faire relire.
 */

export const LEGAL_PAGES = {
  "mentions-legales": "Mentions légales",
  cgv: "Conditions générales de vente",
  confidentialite: "Politique de confidentialité",
} as const;
export type LegalPageId = keyof typeof LEGAL_PAGES;
export const LEGAL_PAGE_IDS = Object.keys(LEGAL_PAGES) as LegalPageId[];

export function isLegalPageId(value: string): value is LegalPageId {
  return value in LEGAL_PAGES;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .nullish()
    .transform((value) => value || null);

export const schoolLegalInput = z
  .object({
    /** École modifiée (par défaut, celle de l'appelant). */
    schoolId: z.string().min(1).max(128).nullish(),
    companyName: z.string().trim().min(1, "Nom ou raison sociale requis").max(120),
    legalForm: z.string().trim().min(1, "Forme juridique requise").max(80),
    siret: z
      .string()
      .transform((value) => value.replace(/\s/g, ""))
      .pipe(z.string().regex(/^(\d{9}|\d{14})$/, "SIRET (14 chiffres) ou SIREN (9 chiffres)")),
    address: z.string().trim().min(5, "Adresse requise").max(300),
    /**
     * franchise : TVA non applicable (art. 293 B du CGI) ; standard : TVA à 20 % incluse ;
     * exempt : formation professionnelle exonérée (art. 261-4-4° a du CGI).
     */
    vatMode: z.enum(["franchise", "standard", "exempt"]),
    /** Numéro de TVA intracommunautaire (requis avec la TVA à 20 %). */
    vatNumber: optionalText(20),
    publisherName: z.string().trim().min(1, "Directeur de la publication requis").max(120),
    contactEmail: emailSchema,
    phone: optionalText(30),
    /** Médiateur de la consommation (obligatoire pour vendre à des particuliers). */
    mediatorName: optionalText(200),
    mediatorUrl: z
      .url({ protocol: /^https?$/, message: "Adresse du site du médiateur invalide" })
      .max(300)
      .nullish()
      .or(z.literal("").transform(() => null))
      .transform((value) => value || null),
    /** Garantie « satisfait ou remboursé » en jours (0 : aucune). */
    refundDays: z.number().int().min(0).max(90),
    /** Durée d'accès en mois (null : sans limite). */
    accessMonths: z.number().int().min(1).max(120).nullable(),
    /** Clauses ajoutées à la fin des CGV. */
    extraTerms: optionalText(5000),
  })
  .superRefine((value, ctx) => {
    if (value.vatMode === "standard" && !value.vatNumber) {
      ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "Numéro de TVA requis" });
    }
  });
export type SchoolLegalInput = z.input<typeof schoolLegalInput>;
export type SchoolLegalInfo = Omit<z.output<typeof schoolLegalInput>, "schoolId">;

/** creators/{id}/legal/info : lisible publiquement, écrit par la callable saveSchoolLegal. */
export type SchoolLegalDoc<T = unknown> = SchoolLegalInfo & { updatedAt: T };

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalPage {
  title: string;
  sections: LegalSection[];
}

export interface LegalContext {
  schoolName: string;
  platformName: string;
}

/** Taux de TVA appliqué aux ventes (en %). */
export function vatRate(info: Pick<SchoolLegalInfo, "vatMode">): number {
  return info.vatMode === "standard" ? 20 : 0;
}

/** Mention de TVA des pages légales et des factures. */
export function vatMention(info: Pick<SchoolLegalInfo, "vatMode" | "vatNumber">): string {
  switch (info.vatMode) {
    case "standard":
      return `TVA intracommunautaire : ${info.vatNumber ?? "—"}.`;
    case "exempt":
      return "Exonération de TVA, article 261-4-4° a du Code général des impôts (formation professionnelle).";
    default:
      return "TVA non applicable, article 293 B du Code général des impôts.";
  }
}

function sellerLines(info: SchoolLegalInfo): string[] {
  return [
    `${info.companyName}, ${info.legalForm}.`,
    `${info.siret.length === 14 ? "SIRET" : "SIREN"} : ${info.siret}.`,
    `Adresse : ${info.address}.`,
    vatMention(info),
    `Contact : ${info.contactEmail}${info.phone ? `, ${info.phone}` : ""}.`,
  ];
}

const HOSTING =
  "Le site est hébergé par Google Cloud EMEA Limited, 70 Sir John Rogerson's Quay, Dublin 2, Irlande (service Firebase), sur des serveurs situés aux Pays-Bas.";

function legalNotice(info: SchoolLegalInfo, ctx: LegalContext): LegalPage {
  return {
    title: LEGAL_PAGES["mentions-legales"],
    sections: [
      { heading: "Éditeur du site", paragraphs: sellerLines(info) },
      {
        heading: "Directeur de la publication",
        paragraphs: [info.publisherName],
      },
      {
        heading: "Hébergement",
        paragraphs: [HOSTING, `Plateforme technique : ${ctx.platformName}.`],
      },
      {
        heading: "Propriété intellectuelle",
        paragraphs: [
          `Les contenus de ${ctx.schoolName} (vidéos, textes, images, supports) sont protégés par le droit d'auteur. Toute reproduction ou diffusion, même partielle, sans autorisation écrite est interdite.`,
        ],
      },
    ],
  };
}

function termsOfSale(info: SchoolLegalInfo, ctx: LegalContext): LegalPage {
  const mediator = info.mediatorName
    ? `En cas de litige non résolu, l'acheteur consommateur peut recourir gratuitement au médiateur de la consommation : ${info.mediatorName}${info.mediatorUrl ? ` (${info.mediatorUrl})` : ""}.`
    : "En cas de litige non résolu, l'acheteur consommateur peut recourir gratuitement à un médiateur de la consommation.";
  const access = info.accessMonths
    ? `L'accès est valable ${info.accessMonths} mois à compter de l'achat.`
    : "L'accès est accordé sans limite de durée, tant que la formation est proposée sur la plateforme.";
  return {
    title: LEGAL_PAGES.cgv,
    sections: [
      {
        heading: "1. Objet",
        paragraphs: [
          `Les présentes conditions générales de vente (CGV) s'appliquent à toute commande de formation en ligne passée auprès de ${info.companyName} (« le Vendeur ») sur le site de ${ctx.schoolName}. Toute commande implique leur acceptation sans réserve.`,
        ],
      },
      { heading: "2. Vendeur", paragraphs: sellerLines(info) },
      {
        heading: "3. Formations",
        paragraphs: [
          "Les formations sont des contenus numériques (vidéos, textes, ressources) accessibles en ligne depuis un compte personnel. Leur contenu est décrit sur leur page de présentation.",
        ],
      },
      {
        heading: "4. Prix",
        paragraphs: [
          `Les prix sont indiqués en euros, toutes taxes comprises. ${info.vatMode === "standard" ? "La TVA est incluse au taux de 20 %." : vatMention(info)} Le prix applicable est celui affiché au moment de la commande.`,
        ],
      },
      {
        heading: "5. Commande et paiement",
        paragraphs: [
          "Le paiement s'effectue en ligne par carte bancaire via la solution sécurisée Stripe. Le Vendeur n'a jamais accès aux données de la carte. Une facture est émise pour chaque paiement.",
          "Lorsque le paiement en plusieurs fois est proposé, les échéances sont prélevées automatiquement chaque mois sur la carte utilisée. En cas d'échec d'une échéance, l'accès peut être suspendu jusqu'à régularisation.",
        ],
      },
      {
        heading: "6. Accès à la formation",
        paragraphs: [
          `L'accès est ouvert dès la confirmation du paiement. ${access} Il est personnel : les identifiants ne doivent pas être partagés.`,
        ],
      },
      {
        heading: "7. Droit de rétractation",
        paragraphs: [
          "Conformément à l'article L221-28 13° du Code de la consommation, le droit de rétractation ne peut pas être exercé pour un contenu numérique fourni sans support matériel dont l'exécution a commencé avec l'accord préalable exprès du consommateur, qui a renoncé expressément à ce droit. Lors de la commande, l'acheteur demande l'accès immédiat à la formation et renonce ainsi à son droit de rétractation.",
          ...(info.refundDays > 0
            ? [
                `Garantie : le Vendeur rembourse toutefois toute formation sur simple demande à ${info.contactEmail} dans les ${info.refundDays} jours suivant l'achat. Le remboursement met fin à l'accès.`,
              ]
            : []),
        ],
      },
      {
        heading: "8. Responsabilité",
        paragraphs: [
          "Le Vendeur fournit un contenu conforme à sa description. Il ne peut être tenu responsable des interruptions dues à la maintenance, au réseau internet ou à l'équipement de l'acheteur. Les résultats obtenus dépendent de l'implication de chacun.",
        ],
      },
      {
        heading: "9. Propriété intellectuelle",
        paragraphs: [
          "L'ensemble des contenus est protégé par le droit d'auteur. L'achat donne un droit d'utilisation personnel et non transférable : toute reproduction, diffusion, revente ou partage, même partiel, est interdit.",
        ],
      },
      {
        heading: "10. Données personnelles",
        paragraphs: [
          "Les données collectées lors de la commande sont traitées conformément à la politique de confidentialité du site.",
        ],
      },
      {
        heading: "11. Réclamations et médiation",
        paragraphs: [
          `Pour toute réclamation : ${info.contactEmail}${info.phone ? ` ou ${info.phone}` : ""}.`,
          mediator,
        ],
      },
      {
        heading: "12. Droit applicable",
        paragraphs: ["Les présentes CGV sont soumises au droit français."],
      },
      ...(info.extraTerms
        ? [
            {
              heading: "13. Dispositions particulières",
              paragraphs: info.extraTerms.split(/\n{2,}/).map((part) => part.trim()),
            },
          ]
        : []),
    ],
  };
}

function privacyPolicy(info: SchoolLegalInfo, ctx: LegalContext): LegalPage {
  return {
    title: LEGAL_PAGES.confidentialite,
    sections: [
      {
        heading: "Responsable du traitement",
        paragraphs: [`${info.companyName}, ${info.address}. Contact : ${info.contactEmail}.`],
      },
      {
        heading: "Données collectées",
        paragraphs: [
          "Compte : nom, adresse email et, si vous l'ajoutez, photo de profil.",
          "Suivi pédagogique : progression dans les formations, commentaires et messages échangés avec l'école.",
          "Achats : nom, email, montant et date. Les données bancaires sont traitées uniquement par Stripe.",
          "Données techniques : jetons de notification si vous les activez, et données de connexion nécessaires à la sécurité.",
        ],
      },
      {
        heading: "Finalités et bases légales",
        paragraphs: [
          "Donner accès aux formations achetées et assurer le suivi pédagogique (exécution du contrat).",
          "Facturation et comptabilité (obligation légale).",
          "Sécurité du service et prévention des abus (intérêt légitime).",
          "Notifications sur vos appareils (consentement, retirable à tout moment depuis votre compte).",
        ],
      },
      {
        heading: "Destinataires et sous-traitants",
        paragraphs: [
          `Vos données sont destinées à ${info.companyName} et à son équipe. Elles ne sont jamais vendues.`,
          "Google (Firebase) : hébergement et authentification. Les données sont hébergées dans l'Union européenne ; certaines données de connexion peuvent être traitées aux États-Unis, encadrées par les clauses contractuelles types de la Commission européenne.",
          "Stripe : paiement en ligne.",
          "Vimeo : diffusion des vidéos, sans suivi publicitaire.",
          `${ctx.platformName} : éditeur de la plateforme technique.`,
          "Le prestataire d'envoi des emails de l'école.",
        ],
      },
      {
        heading: "Durée de conservation",
        paragraphs: [
          "Compte, progression, commentaires et messages : tant que le compte est actif, puis 3 ans après la dernière activité.",
          "Données de facturation : 10 ans (obligation comptable).",
        ],
      },
      {
        heading: "Vos droits",
        paragraphs: [
          `Vous disposez des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Pour les exercer : ${info.contactEmail}. Une réponse vous est apportée sous un mois.`,
          "Vous pouvez aussi adresser une réclamation à la CNIL (www.cnil.fr).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Le site n'utilise ni cookies publicitaires ni outil de mesure d'audience. Seuls les éléments techniques nécessaires à la connexion sont enregistrés sur votre appareil.",
        ],
      },
    ],
  };
}

export function legalPage(id: LegalPageId, info: SchoolLegalInfo, ctx: LegalContext): LegalPage {
  switch (id) {
    case "mentions-legales":
      return legalNotice(info, ctx);
    case "cgv":
      return termsOfSale(info, ctx);
    case "confidentialite":
      return privacyPolicy(info, ctx);
  }
}

/** Points à compléter avant de vendre (affichés dans les paramètres). */
export function legalWarnings(info: SchoolLegalInfo | null | undefined): string[] {
  if (!info) return ["Informations légales à compléter"];
  return info.mediatorName
    ? []
    : [
        "Médiateur de la consommation à indiquer : obligatoire pour vendre à des particuliers (ex. CM2C, Médiateur de la consommation FEVAD).",
      ];
}
