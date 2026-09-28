# Nouveautés

Ce qui a été ajouté à Forma Host, et où le trouver. Tout ce qui est facultatif est désactivé par
défaut : rien ne change pour les élèves tant que l'école ne l'active pas.

## Vendre

- **Pages légales** (mentions légales, CGV, confidentialité) générées depuis *Paramètres >
  Informations légales*, liées en pied de page des pages publiques. Modèles à faire relire.
- **Récapitulatif d'achat** : CGV acceptées et renonciation au droit de rétractation cochées avant le
  paiement.
- **Factures numérotées** automatiques (et avoirs en cas de remboursement), dans *Mon compte > Mes
  achats* pour l'élève et dans *Vente* pour l'école (si l'école garde la facturation Forma Host).
- **Paiement en 2, 3 ou 4 fois** sans frais (*Vente* de la formation).
- **Codes promo** saisis dans la fenêtre de commande (prix remisé affiché avant de payer),
  valables aussi en plusieurs fois sauf si le formateur les réserve au paiement en une fois.
- **Factures et impayés** (*Paramètres > Paiements*) : factures établies par Forma Host, par
  Stripe ou par l'outil du formateur (Pennylane, Tiime, Quaderno…) ; en cas d'échéance impayée,
  accès retiré à l'arrêt des relances Stripe, suspendu tout de suite, ou jamais retiré.

## Enseigner

- **Quiz** en fin de leçon (bonnes réponses cachées jusqu'à la réussite, réussite obligatoire en
  option, résultats pour le formateur).
- **Exercices à rendre** : l'élève envoie une vidéo, une image, un PDF ou un lien ; le formateur
  commente la vidéo au bon moment (*Admin > Exercices*).
- **Ouverture progressive** des leçons : dans l'ordre, ou un chapitre tous les N jours (*Détails*).
- **Directs** (Zoom, Meet, Teams) : onglet *Directs* ; les élèves rejoignent depuis la page de la
  formation et l'ajoutent à leur agenda.
- **Annonces** aux élèves d'une formation (email seulement si coché).
- **Assistant IA** sous les leçons (après ajout d'une clé API dans *Plateforme > Vue d'ensemble*,
  puis activation par formation).
- **Communauté d'école** : espace d'échange entre élèves et équipe (*Admin > Communauté*).
- **Notes de l'élève** : sous chaque leçon, notes personnelles (visibles par l'élève seul),
  enregistrées pendant la saisie et regroupées sur la page de la formation.

## Suivre

- **Statistiques** : chiffre d'affaires, nouveaux élèves, progression, décrochage par leçon,
  satisfaction.
- **Qualiopi / financements** : temps passé jour par jour, attestation d'assiduité imprimable (menu
  « … » d'un élève), avis de fin de formation, numéro de déclaration d'activité.
- **Certificats de réussite** vérifiables en ligne.
- **Accueil formateur** : « Premiers pas » pour ouvrir son école (étapes cochées au fur et à
  mesure, masquables) et bloc « À faire » (exercices à corriger, messages non lus).

## Gérer

- **Duplication** d'une formation (menu de la formation).
- **Import d'élèves** depuis Podia, Teachable, Thinkific, Kajabi, Systeme.io… (CSV).
- **Intégrations** : webhooks signés vers Zapier, Make ou n8n (*Paramètres > Intégrations*).
- **Paramètres par sections** : raccourcis en haut de page (École, Paiements, Emails…).
- **Vue d'ensemble de la plateforme** (administrateurs de la plateforme).
- **Sauvegardes quotidiennes** de la base, conservées 14 jours.

## Sous le capot

- Pages plus légères : environ un quart de JavaScript en moins sur les pages élèves, 40 ko de
  moins sur toutes les pages, page de vente trois fois plus légère (la fenêtre de commande se
  charge à la demande).
- Accessibilité (contrôlée avec axe) : contrastes AA ; la couleur de l'école est légèrement
  assombrie sur les pages publiques et dans les emails quand le texte blanc serait peu lisible.
- Leçon : boutons « Précédente » et « Suivante » visibles.
- Pages « introuvable » et « erreur » en français ; après une mise en ligne, la page se recharge
  d'elle-même au lieu d'afficher une erreur.
- Référencement : robots.txt, plan du site par domaine, adresse canonique sur le domaine de
  l'école, données structurées (formation, école, prix) lisibles par Google.
- Aucun email n'est envoyé par ces nouveautés, sauf les annonces si le formateur coche l'envoi par
  email.
