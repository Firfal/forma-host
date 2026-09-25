# Mise en production (projet Firebase `forma-host`)

Pour le développement local, les émulateurs suffisent (voir le README).

> **Région unique : `europe-west4` (Pays-Bas).** La région de Firestore et celle du bucket Storage ne peuvent **plus être changées** après leur création.

Le déploiement est **automatique** : le workflow GitHub Actions `Déploiement Firebase` (`.github/workflows/deploy.yml`) prépare le projet et déploie tout à chaque push sur la branche par défaut. Il suffit de lui donner un accès au projet (étape 1), sans aucune clé à manipuler.

Adresse de l'application : **https://forma-host--forma-host.europe-west4.hosted.app**

## 1. Donner accès au projet (une seule fois)

1. **Offre Blaze** : Console Firebase > ⚙️ Paramètres du projet > *Utilisation et facturation* > *Modifier l'offre* > Blaze. Obligatoire pour App Hosting et Cloud Functions. Pense à définir une alerte budgétaire (par ex. 10 €).
2. **Accès GitHub → Google Cloud, sans clé** (Workload Identity Federation) :
   1. Ouvre [Cloud Shell](https://shell.cloud.google.com/?project=forma-host) (terminal dans le navigateur, rien à installer).
   2. Colle cette commande :
      ```bash
      curl -fsSL https://raw.githubusercontent.com/Firfal/forma-host/claude/optimistic-knuth-lnjps2/scripts/setup-github-deploy.sh | bash
      ```
   3. Elle crée le compte de service `github-deploy` (rôle Propriétaire). Seul le workflow `deploy.yml` de ce dépôt peut l'utiliser.
   4. Reporte le **numéro de projet** affiché à la fin dans `PROJECT_NUMBER` de `.github/workflows/deploy.yml`.
3. **Authentication** : [Console > Authentication](https://console.firebase.google.com/project/forma-host/authentication) > *Commencer*.
   - Il n'y a rien à cocher : le workflow active lui-même Email/Mot de passe, les domaines autorisés et les emails en français.
   - Ce clic reste manuel : via l'API, le projet serait converti en Identity Platform, de façon irréversible.

Ensuite, lance le workflow : *Actions > Déploiement Firebase > Run workflow*. Il fait automatiquement :

| Étape | Détail |
|---|---|
| APIs | Activation de Firestore, Functions, App Hosting, Secret Manager… |
| Firestore | Base `(default)` en `europe-west4`, règles, index, TTL |
| Authentication | Email/mot de passe, domaines autorisés, emails en français |
| Storage | Bucket par défaut en `europe-west4`, règles |
| Functions | Invitations, activation, Vimeo, notifications (APP_URL dans `functions/.env.forma-host`) |
| App Hosting | Backend `forma-host`, build Next.js depuis les sources du dépôt |
| IAM | Lecture Firestore pour le serveur Next.js (pages de vente) |
| Formateur | Si l'email est renseigné dans le formulaire *Run workflow* : compte, rôle et fiche formateur |

Pour le **compte formateur**, renseigne l'email dans le formulaire *Run workflow*. Si le compte n'existe pas, il est créé sans mot de passe : utilise « Mot de passe oublié » sur `/connexion` pour en définir un.

<details>
<summary>Rôles minimaux au lieu de « Propriétaire »</summary>

Firebase Admin, Cloud Functions Admin, Cloud Run Admin, Service Account User, Secret Manager Admin, Service Usage Admin, Cloud Build Editor, Artifact Registry Administrator, Firebase App Hosting Admin, Storage Admin, Project IAM Admin, Firebase Extensions Admin.
</details>

## 2. Vimeo

1. Crée un token sur [developer.vimeo.com](https://developer.vimeo.com/apps) : *Create app*, puis *Generate access token*, scope **Private**.
2. Ajoute-le en secret GitHub `VIMEO_ACCESS_TOKEN` et relance le workflow.
3. Sans token, la durée et la miniature sont récupérées via oEmbed quand c'est possible. La lecture des vidéos fonctionne dans tous les cas.

Pour chaque vidéo de leçon :

1. **Confidentialité** : *Masquer de Vimeo* (non répertoriée).
2. **Où cette vidéo peut-elle être intégrée ?** *Domaines spécifiques*. Ajoute :
   - `forma-host--forma-host.europe-west4.hosted.app` ;
   - ton domaine perso s'il y en a un ;
   - `localhost` pour le développement.
3. Copie le lien de la vidéo (avec son hash, par ex. `https://vimeo.com/123456789/abcdef1234`) dans l'éditeur de leçon.

⚠️ **À vérifier sur ton abonnement Vimeo** : la restriction par domaine n'est pas disponible sur toutes les offres. La grille Vimeo change en 2026 ; selon les sources, elle pourrait exiger l'offre *Core* ou supérieure.

## 3. Emails (Brevo)

Sans cette étape, les emails de bienvenue et de notification sont préparés dans la collection `mail`, mais ne partent pas. Les emails de Firebase Auth (mot de passe oublié) fonctionnent, eux, dès le départ.

1. Crée un compte [Brevo](https://www.brevo.com). Authentifie ton domaine d'envoi (SPF, DKIM, DMARC) et génère une **clé SMTP** (*SMTP & API*).
2. Ajoute trois secrets GitHub :
   - `SMTP_CONNECTION_URI` = `smtps://<login-brevo>@smtp-relay.brevo.com:465`
   - `SMTP_PASSWORD` = la clé SMTP
   - `MAIL_FROM` = `Ecole Motion <contact@ecolemotion.com>`
3. Relance le workflow : il installe l'extension *Trigger Email from Firestore* (`europe-west4`).

## 4. Domaine personnalisé (optionnel)

1. Console > App Hosting > backend `forma-host` > *Paramètres* > *Domaines*. Ajoute par exemple `formation.ecolemotion.com`, puis crée les enregistrements DNS indiqués.
2. Mets l'adresse dans `apphosting.yaml` (`NEXT_PUBLIC_APP_URL`) et dans `functions/.env.forma-host` (`APP_URL`).
3. Ajoute-la dans les domaines Vimeo, puis relance le workflow.

## 5. Migration depuis Podia

1. Ré-uploade les vidéos sur Vimeo (télécharge les originaux depuis Podia si besoin).
2. Recrée la formation, les chapitres et les leçons dans *Admin > Formations*.
3. Exporte les clients depuis Podia (*Audience > Export*), puis dans la formation clique sur *Donner l'accès > Importer un CSV*.
   - Colonnes reconnues : `email`, `name`/`nom`, `signed up`/`date`.
   - Décoche l'email de bienvenue pour préparer la migration en silence.
   - Pour annoncer la nouvelle plateforme, adapte le modèle d'email de bienvenue, puis renvoie les accès.
4. Teste avec 2-3 élèves pilotes avant de basculer.

## Déployer à la main (alternative)

```bash
gcloud auth application-default login
npx tsx scripts/bootstrap-firebase.ts --project forma-host
npx firebase deploy --only firestore,storage,functions,apphosting --project forma-host
npm run make-creator -- --project forma-host --email <email> --name "Ecole Motion" --slug ecole-motion
```
