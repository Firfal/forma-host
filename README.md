# Forma Host

Plateforme d'hébergement de formations en ligne, pensée comme une alternative à Podia centrée **uniquement** sur les formations.

- Stack : **Next.js** (App Hosting), **Firebase Auth**, **Firestore**, **Storage**, **Cloud Functions** — tout en `europe-west4`.
- Vidéos : **Vimeo**.
- Premier client : Ecole Motion.

- Plan détaillé : [`docs/PLAN.md`](docs/PLAN.md)
- Mise en production : [`docs/SETUP.md`](docs/SETUP.md)

## Fonctionnalités (V1)

| Espace | Fonctionnalités |
|---|---|
| Comptes | Inscription, connexion, mot de passe oublié, activation par invitation (`/bienvenue/[token]`) |
| Formateur (`/admin`) | Formations (titre, description, miniature, slug), plan avec chapitres, sous-chapitres et leçons, leçons (vidéo Vimeo, miniature, description, liens, pièces jointes), élèves (invitation, import CSV, progression), commentaires, notifications, mail de bienvenue |
| Élève (`/formations`) | Mes formations (tous formateurs confondus), lecteur vidéo, progression, reprise, commentaires |
| Public | Page de vente `/{formateur}/{formation}` |

## Structure

```
src/app/        routes Next.js : (auth), (app)/admin, (app)/formations, (public)
src/components/ UI (Tailwind, Radix), éditeurs, lecteur
src/lib/        client Firebase, auth, hooks Firestore
shared/         types, schémas zod, helpers partagés app ↔ functions
functions/      Cloud Functions (bundle esbuild)
scripts/        make-creator, seed-emulator
tests/rules/    tests des règles Firestore / Storage
```

## Développement local (émulateurs, aucun vrai projet requis)

Prérequis : Node 22 et Java 21 (pour les émulateurs).

```bash
npm install && npm --prefix functions install
cp .env.example .env.local        # NEXT_PUBLIC_USE_EMULATORS=true

npm run emulators                 # terminal 1 : Auth, Firestore, Storage, Functions (UI : http://127.0.0.1:4000)
npm run seed                      # terminal 2 : données de démo
npm run dev                       # terminal 3 : http://localhost:3000
```

Comptes de démo :
- **formateur** : `theo@ecolemotion.com` / `motion123`
- **élève** : `anne@exemple.fr` / `eleve123`

Les emails ne partent pas en local. Ils sont visibles dans la collection `mail` de l'UI des émulateurs, avec les liens d'activation.

## Tests

```bash
npm run lint && npm run typecheck
npm test                          # tests unitaires (shared, lib)
npm run test:rules                # règles Firestore + Storage (émulateurs)
npm --prefix functions test       # Functions : tests unitaires
npm --prefix functions run test:emu   # Functions : intégration (émulateurs Auth + Firestore)
```
