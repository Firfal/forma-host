# Plan — Forma Host (plateforme d'hébergement de formations, 100 % Firebase)

## Contexte

Objectif : une alternative à Podia **centrée uniquement sur l'hébergement de formations**. Premier et seul utilisateur en V1 : **Ecole Motion (Théo Robert)**, qui migre depuis Podia (1-2 formations, environ 15 leçons, environ 40-70 élèves, commentaires par leçon). La commercialisation auprès d'autres formateurs viendra plus tard.

Décisions prises :
- **Stack 100 % Firebase** : App Hosting, Auth, Firestore, Storage, Cloud Functions.
- **Pas de Stripe en V1.** Modèle futur : abonnement formateur, 0 % de commission.
- **Vidéos sur Vimeo** (compte du formateur).
- **Accès élève en V1 = invitation par email**, avec en plus l'import en masse des clients Podia.

**Maquettes** : page Figma « app forma » du fichier *Sites Persos*. On y trouve Login `2192:822`, Accueil `2192:860`, Produits `2192:2348`, détail produit `2192:4421`, édition contenu `2192:5763`, Détails `2192:6660`, Disponibilité `2192:7366`, édition leçon `2192:7666`, édition vidéo `2192:7921`, Membres `2192:2467`, Commentaires `2192:987`, Chat `2192:1157`, Formation `2192:1462`, Leçon `2192:1836` et Website `2192:2153`.

Le dépôt `forma-host` est vide (branche `claude/optimistic-knuth-lnjps2`).

**Vocabulaire** : Formation > Chapitre > Sous-chapitre (optionnel) > Leçon. Une leçon correspond à un « module » dans le brief.

---

## 1. Architecture

```
Navigateur ── Next.js (App Router) sur Firebase App Hosting (europe-west4)
   │            ├─ pages publiques (vente, page formateur) : SSR, lecture Admin SDK
   │            └─ app connectée (admin + espace membre) : client, Firebase JS SDK
   ├── Firebase Auth (email + mot de passe ; custom claim `creator: true`)
   ├── Firestore (europe-west4) ← règles de sécurité = contrôle d'accès
   ├── Cloud Storage (europe-west4) : miniatures publiques, pièces jointes protégées
   ├── Cloud Functions v2 (europe-west4)
   │     ├─ callables : grantAccess (invitation + import CSV), acceptInvite, revokeAccess, resolveVimeoVideo
   │     └─ déclencheur : onCommentCreated (notifications + email au formateur)
   ├── Extension « Trigger Email from Firestore » + SMTP Brevo
   └── Vimeo (vidéo non répertoriée à domaine restreint, @vimeo/player, API pour les métadonnées)
```

- **Région unique europe-west4** (Pays-Bas) pour tout. C'est la seule région UE d'App Hosting, et la région de Firestore et du bucket Storage est **irréversible**.
- **UI** : TypeScript, Tailwind, shadcn/ui, Tiptap (texte riche), dnd-kit (glisser-déposer), zod + react-hook-form.
- **Next.js** : épingler la dernière version marquée « Active » par App Hosting (15.x vérifiée). Pas de PPR, pas de Middleware/Proxy pour le routage.
- **`apphosting.yaml`** : `maxInstances: 2`, secrets via `firebase apphosting:secrets:set`, variables `NEXT_PUBLIC_*` disponibles au BUILD.
- **Design tokens issus du Figma** :
  - police Inter (Medium 14 par défaut) ;
  - texte `#06040E`, texte secondaire `#717073`, bordures `#D6D6D7`, sidebar `#F5F5F5` ;
  - accent violet `#5A0EB5` / `#F2EBFA` (badge « Créateur ») ;
  - bleu `#186B91` / `#EAF3F7` (badge d'ancienneté) ;
  - violet du logo `#9D72F9`.

## 2. Modèle de données (Firestore)

Chaque document porte un `creatorId`, pour que plusieurs formateurs puissent cohabiter plus tard.

| Chemin | Contenu | Accès (règles) |
|---|---|---|
| `users/{uid}` | email, préférences de notification (privé) | l'utilisateur |
| `profiles/{uid}` | displayName, avatarUrl, createdAt (public : affiché dans les commentaires) | lecture connectée ; écriture par soi |
| `creators/{uid}` | nom de marque, slug, logo, couleur, email de support | lecture publique ; écriture par le propriétaire. Créé en V1 par `scripts/make-creator.ts`, qui pose aussi le claim |
| `courses/{courseId}` | creatorId, title, slug, description, thumbnailUrl, status (draft/published), visibility, commentsMode, salesPage {…}, `outlineVersion`, **items** : liste plate ordonnée `[{id, kind: chapter\|subchapter\|lesson, title, isPreview, hidden, durationSec}]` | lecture si publiée, si propriétaire, ou si élève inscrit (dépublier ne coupe pas l'accès des inscrits) ; écriture par le propriétaire |
| `courses/{id}/private/settings` | modèle d'email de bienvenue, lien CTA externe | propriétaire uniquement |
| `courses/{id}/lessons/{lessonId}` | **contenu protégé** : vimeo {id, hash, thumbnail, duration}, description, liens [{label, url}], pièces jointes [{name, path}], miniature perso. Copies de `creatorId`, `isPreview`, `courseStatus` pour les règles | propriétaire, inscrit actif, ou tous si `isPreview` |
| `courses/{id}/comments/{cid}` | lessonId, courseId, creatorId, authorUid, body, parentId, createdAt | création si inscrit ou propriétaire et commentaires actifs ; 1 seul niveau de réponse (`get(parent).parentId == null`) ; suppression par l'auteur ou le propriétaire ; règle `{path=**}/comments` pour la page de modération |
| `enrollments/{courseId_uid}` | courseId, creatorId, uid, email, source (invite/import/stripe), orderId?, status (active/revoked), joinedAt, progress {completedLessonIds[], lastLessonId, lastActivityAt} | lecture par l'élève ou le formateur ; **création uniquement côté serveur** ; l'élève ne modifie que `progress` (`affectedKeys().hasOnly(['progress'])`, `lastActivityAt == request.time`) |
| `invites/{token}` | uid, email, courseId, expiresAt (+30 j), usedAt | serveur uniquement |
| `users/{uid}/notifications/{id}` | type, payload, read, createdAt | l'utilisateur |
| `mail/{id}` | consommé par l'extension (HTML déjà rendu) | serveur uniquement |

Points clés :
- **Plan en liste plate dans le document de la formation.** Une seule lecture alimente la page de vente et la sidebar du lecteur, et dnd-kit gère une seule liste triable.
- **Sauvegarde du plan en transaction**, avec vérification de `outlineVersion` (deux onglets ouverts ne s'écrasent pas). Les copies `isPreview`/`courseStatus` des leçons sont mises à jour dans le même lot.
- **Rien de sensible dans `courses/{id}`**, puisqu'il est public une fois publié : pas de template email, pas d'ID Vimeo.
- **Compteurs sans documents dédiés** : nombre d'élèves via des requêtes `count()` ; progression = `completedLessonIds.length` ; badge « Créateur » calculé à l'affichage (`authorUid == course.creatorId`).
- **Fil « activité récente »** de l'Accueil : fusion de 3 requêtes (inscriptions récentes, commentaires récents en collection group, dernières activités).
- **Pièces jointes protégées** servies via `getBlob()`, les règles Storage vérifiant l'inscription avec `firestore.exists`. Pas d'URL à token permanente. Les miniatures sont publiques.

## 3. Correspondance besoins → écrans

| # | Besoin | Route | Réf. Figma |
|---|---|---|---|
| 1 | Créer un compte | `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/bienvenue/[token]` | Login |
| 2 | Espace formateur / formé | layout avec sidebar : **Admin** (si claim `creator`) + **Espace membre** (tous) | sidebar |
| 3 | Créer une formation | `/admin/formations`, `/admin/formations/[id]/details` | Produits, Détails, Disponibilité |
| 3 | Page de vente + URL perso (opt.) | `/[creatorSlug]/[courseSlug]` (liste de slugs réservés : admin, formations, connexion…) | Website + style des LP |
| 4 | Chapitres / sous-chapitres / leçons | `/admin/formations/[id]/contenu` | édition contenu, menu leçon |
| 4 | Leçon : vidéo + miniature, titre, description, liens | `/admin/formations/[id]/lecons/[lessonId]` | édition leçon, édition vidéo |
| 4 | Commentaires | sous chaque leçon + `/admin/commentaires` | Leçon, Commentaires |
| 5 | Nombre d'élèves | Accueil (KPI), `/admin/formations/[id]` (tableau), `/admin/membres` | Accueil, détail produit, Membres |
| 6 | Mail de bienvenue | envoyé par `grantAccess`, modèle modifiable par formation | — |
| 7 | Notifications | cloche temps réel + email au formateur | cloche (Leçon, sidebar) |
| 8 | Coupons / codes promo | **V2 avec Stripe** (sans paiement, un coupon n'a pas d'effet) | menu produit |
| Bonus | Progression des élèves | « 8 / 15 » par élève, barre « x sur N terminés », bouton Terminer, complétion auto à 90 % | détail produit, Leçon |
| — | Espace élève | `/formations`, `/formations/[courseId]`, `/formations/[courseId]/[lessonId]` | Formation, Leçon |

## 4. Parcours clés

**Donner l'accès : un seul module serveur `grantAccess()`**, réutilisé par l'invitation, l'import CSV et plus tard le webhook Stripe.
1. Vérifier que l'appelant est propriétaire de la formation (claim + `course.creatorId`).
2. Pour chaque email : `getUserByEmail`, sinon `createUser({email})`.
3. Écrire en un seul lot :
   - `enrollments/{courseId_uid}`, via `create`, donc idempotent ;
   - `invites/{token}` si le compte est nouveau (expiration 30 jours) ;
   - `mail/welcome_{courseId_uid}`, avec un ID déterministe pour ne pas envoyer deux fois. Le HTML est rendu côté serveur à partir du modèle de la formation (`{{prenom}}`, `{{formation}}`, `{{lien}}`) ;
   - la notification « nouvel élève » du formateur.
4. Import Podia : conserver la date d'inscription, avec une option « ne pas envoyer d'email » ou « email spécial nouvelle plateforme ».

**Activation du compte**
1. Le mail contient le lien `/bienvenue/[token]`. Un lien de réinitialisation Firebase expire trop vite pour un mail lu plusieurs jours plus tard.
2. L'élève choisit son mot de passe, puis la callable `acceptInvite` exécute `updateUser(uid, {password, emailVerified: true})`.
3. Le client se connecte avec `signInWithEmailAndPassword`.
4. `/inscription` gère le cas `email-already-in-use` pour les comptes pré-créés (redirection vers « mot de passe oublié »).

**Vidéo Vimeo**
1. Le formateur colle le lien de la vidéo non répertoriée. `resolveVimeoVideo` (token personnel Vimeo avec le scope `private`, stocké dans Secret Manager) en extrait id + hash, la durée et la miniature.
2. Une miniature personnalisée peut remplacer celle de Vimeo.
3. Lecteur : `@vimeo/player` avec `https://player.vimeo.com/video/{id}?h={hash}`.
   - Complétion automatique à ≥ 90 % (`timeupdate`).
   - Position de reprise en localStorage ; Firestore n'est écrit qu'à la pause ou quand l'onglet est masqué.
4. Côté Vimeo :
   - réglage « Masquer de Vimeo » ;
   - liste de domaines autorisés : localhost, `*.hosted.app`, domaine perso ;
   - **à vérifier sur l'offre actuelle de Théo** (la grille Vimeo change en 2026 ; la restriction par domaine pourrait exiger l'offre Core, environ 33 $/mois).

**Progression** : « Terminer » ou la complétion auto fait un `arrayUnion(lessonId)` dans `progress`. Le formateur voit x/N, la date d'inscription et la dernière activité.

**Notifications**
- In-app dans `users/{uid}/notifications`, écoutées en temps réel.
- V1 : nouvel élève (formateur), nouveau commentaire (formateur, plus un email en option), réponse à mon commentaire (élève).
- `onCommentCreated` utilise des ID déterministes : les déclencheurs peuvent s'exécuter deux fois.

**Emails**
- Extension Trigger Email + clé SMTP Brevo (secret), avec TTL activé.
- Domaine expéditeur avec SPF, DKIM et DMARC.
- Emails Firebase Auth (reset) en français, avec l'URL d'action pointant sur notre domaine.

## 5. Structure du dépôt (sans workspaces npm)

```
forma-host/
├─ src/app/
│  ├─ (auth)/connexion, inscription, mot-de-passe-oublie, bienvenue/[token]
│  ├─ (app)/layout.tsx          # sidebar Admin / Espace membre + garde d'auth
│  │   ├─ admin/…               # accueil, formations, membres, commentaires
│  │   └─ formations/…          # espace élève + lecteur
│  └─ (public)/[creatorSlug]/[courseSlug]/   # page de vente SSR
├─ src/components/ (ui/ shadcn, sidebar, outline-editor, vimeo-player, comments, notifications-bell…)
├─ src/lib/ (firebase/client.ts, firebase/admin.ts, converters web, hooks)
├─ shared/        # schémas zod, chemins, constantes (sans types SDK) — alias TS `@shared/*`
├─ functions/     # package à part, bundle esbuild → lib/index.js (bundle shared/ + zod)
│   └─ src/ grantAccess.ts, acceptInvite.ts, revokeAccess.ts, vimeo.ts, comments.ts, mail.ts
├─ scripts/       # make-creator.ts, seed-emulator.ts
├─ tests/rules/   # @firebase/rules-unit-testing
├─ e2e/           # Playwright
└─ firebase.json, .firebaserc, apphosting.yaml, firestore.rules, firestore.indexes.json, storage.rules
```

`functions/` est exclu du tsconfig et de l'ESLint de Next. Les convertisseurs de `Timestamp` sont séparés entre le SDK web et l'Admin SDK.

## 6. Feuille de route V1

**Prérequis (côté toi / Théo)**
- Projet Firebase en offre Blaze, région europe-west4.
- Vérifier l'offre Vimeo (restriction par domaine + accès API) et créer un token personnel.
- Compte Brevo et DNS du domaine d'envoi.
- Choisir le domaine de la plateforme.

**Phase 0 — Fondations**
- Next.js + TS + Tailwind + shadcn avec les tokens Figma.
- Squelette `functions/` (esbuild) + `shared/`.
- `firebase.json` avec les émulateurs (Auth, Firestore, Functions, Storage), `apphosting.yaml`.
- ESLint/Prettier, Vitest, tests de règles, Playwright, `seed-emulator`.
- CI GitHub Actions (JDK 21 pour les émulateurs).

**Phase 1 — Comptes et espaces** (1, 2)
- Connexion / Inscription / Mot de passe oublié selon la maquette Login.
- Création de `users` + `profiles` au premier login.
- Layout avec sidebar et sections conditionnées au claim `creator`.
- Script `make-creator.ts`.
- Première version de `firestore.rules` + tests.

**Phase 2 — Créer et remplir une formation** (3, 4)
- Liste des formations + création (titre, description riche, miniature Storage, slug).
- Onglets Contenu / Détails / Disponibilité (statut, visibilité, mode commentaires).
- Éditeur de plan en liste plate triable (chapitre, sous-chapitre, leçon), sauvegarde transactionnelle, menu leçon (aperçu, masquer, copier le lien, supprimer).
- Éditeur de leçon : titre, Vimeo (`resolveVimeoVideo`), miniature perso, description Tiptap, liens, pièces jointes, aperçu gratuit.

**Phase 3 — Espace formé** (4, bonus)
- « Mes formations » (tous formateurs confondus).
- Aperçu d'une formation avec la progression.
- Lecteur (sidebar du plan, Vimeo, description + liens + pièces jointes, précédent/suivant, Terminer, complétion auto, reprise).
- Commentaires (fil + réponses, badge « Créateur », suppression).

**Phase 4 — Élèves et mail de bienvenue** (5, 6)
- Extension Trigger Email + Brevo.
- `grantAccess` (formulaire « Donner l'accès » + import CSV Podia), `acceptInvite` + page `/bienvenue/[token]`, `revokeAccess`.
- Éditeur du modèle de bienvenue, avec aperçu et envoi de test.
- Tableau des élèves de la formation : recherche, x/N, dates, renvoyer l'invitation, retirer l'accès.
- Page Membres (cartes, badges Nouveau / ancienneté).

**Phase 5 — Tableau de bord, notifications, modération** (5, 7)
- Accueil : KPI (élèves, inscriptions sur 30 j, commentaires, taux de complétion moyen) + activité récente.
- Cloche de notifications + préférences email.
- Page Commentaires (collection group, réponse en ligne, suppression).
- Déclencheur `onCommentCreated`.

**Phase 6 — Page de vente et URL (optionnel)** (3)
- Page de vente SSR **en modèle fixe à champs modifiables**, dans l'esprit des LP du Figma : bandeau, hero + CTA, description, programme généré depuis le plan, présentation du formateur, témoignages, FAQ, CTA final.
- Couleur de marque ; CTA vers un lien de paiement externe en V1, ou « Accéder » si l'élève est déjà inscrit.
- Slug modifiable (unicité + mots réservés), page publique du formateur, SEO + image Open Graph.

**Migration Ecole Motion** (après la Phase 4)
- Ré-uploader les vidéos sur Vimeo et recréer les leçons.
- Importer le CSV clients Podia.
- Tester avec 2-3 élèves pilotes, puis basculer.

**V2 — plus tard**
- Stripe (Checkout, abonnement formateur) + **coupons / codes promo** (% ou montant, utilisations max, expiration, formations ciblées) ; `grantAccess` réutilisé par le webhook.
- Chat formateur ↔ élève (maquette Chat).
- Onboarding self-service des formateurs, page Website (pages légales, accueil), domaine perso par formateur.
- Connexion Google, webhook d'accès depuis un outil de vente externe, certificats, notifications push (FCM), Mux ou Bunny si Vimeo devient limitant.
- RGPD : signaler dans la politique de confidentialité que Firebase Auth stocke ses données aux États-Unis.

## 7. Vérification

- **Règles** (`@firebase/rules-unit-testing`, profils anonyme / inscrit / révoqué / autre formateur / propriétaire) :
  - lecture des leçons (aperçu ou non) ;
  - l'élève ne modifie que `progress` ;
  - aucune création d'`enrollment` côté client ;
  - réponses limitées à 1 niveau ;
  - requêtes collection group des commentaires ;
  - pièces jointes Storage.
- **Functions** (émulateurs) :
  - `grantAccess` idempotent : deux appels donnent 1 inscription et 1 mail ;
  - invitation expirée ou déjà utilisée refusée ;
  - `onCommentCreated` crée les notifications.
- **E2E Playwright** sur `firebase emulators:exec` + seed, lecteur Vimeo simulé :
  1. le formateur crée une formation, un chapitre et une leçon, puis publie ;
  2. il invite un email ; le lien est lu dans le doc `mail` ;
  3. l'élève active son compte, regarde la leçon, clique sur Terminer et commente ;
  4. le formateur voit 1/N, la notification et le commentaire.
- **Manuel** :
  - déploiement App Hosting de prévisualisation ;
  - vraie vidéo Vimeo à domaine restreint ;
  - vrai email reçu via Brevo ;
  - rendu comparé aux frames Figma listées dans le Contexte.
