# Mise en place du projet Firebase

Ce guide couvre la mise en production. Pour le développement local, les émulateurs suffisent (voir le README).

> **Région unique : `europe-west4` (Pays-Bas).** La région de Firestore et celle du bucket Storage ne peuvent **plus être changées** après leur création.

## 1. Projet Firebase

1. Crée le projet sur [console.firebase.google.com](https://console.firebase.google.com) et passe-le en **offre Blaze** (obligatoire pour App Hosting et Cloud Functions). Pense à définir une alerte budgétaire.
2. **Authentication** : active le fournisseur *Adresse e-mail/Mot de passe*. Dans *Paramètres > Domaines autorisés*, ajoute le domaine de la plateforme.
3. **Authentication > Modèles** : passe la langue des emails en français. Pour la réinitialisation du mot de passe, configure l'URL d'action sur ton domaine.
4. **Firestore** : crée la base `(default)` en mode production, région `europe-west4`.
5. **Storage** : crée le bucket par défaut en `europe-west4`.
6. Renseigne l'identifiant du projet dans `.firebaserc` (remplace `demo-forma`).

## 2. Règles, index et Functions

```bash
npm ci && npm --prefix functions ci
npx firebase login
npx firebase deploy --only firestore,storage       # règles + index (+ TTL sur invites/mail)
```

Paramètres et secrets des Functions :

```bash
# URL publique de la plateforme (liens dans les emails)
echo "APP_URL=https://formation.ecolemotion.com" > functions/.env.<project-id>

# Token personnel Vimeo (developer.vimeo.com > Apps > Generate token, scope « private »)
npx firebase functions:secrets:set VIMEO_ACCESS_TOKEN

npx firebase deploy --only functions
```

## 3. Emails (extension Trigger Email + Brevo)

1. Crée un compte [Brevo](https://www.brevo.com), puis authentifie ton domaine d'envoi (SPF, DKIM, DMARC) et génère une **clé SMTP**.
2. Installe l'extension :
   ```bash
   npx firebase ext:install firebase/firestore-send-email
   ```
   Paramètres :
   - Emplacement : `europe-west4`
   - Collection des emails : `mail`
   - URI SMTP : `smtps://<login-brevo>@smtp-relay.brevo.com:465`
   - Mot de passe SMTP : la clé SMTP Brevo (stockée dans Secret Manager)
   - Expéditeur par défaut : `Ecole Motion <contact@ecolemotion.com>`
   - TTL des documents : activé (le champ `expireAt` est déjà renseigné)
3. Les Functions écrivent des documents `mail/{id}` avec le HTML déjà rendu. L'extension les envoie.

## 4. App Hosting (Next.js)

1. Console Firebase > **App Hosting** > *Créer un backend* : relie le dépôt GitHub, dossier racine `/`, branche de production `main`, région `europe-west4`.
2. Mets à jour `NEXT_PUBLIC_APP_URL` dans `apphosting.yaml`.
3. Si tu utilises une autre marque, ajoute `NEXT_PUBLIC_BRAND_NAME` dans `apphosting.yaml`.
4. La config web Firebase est injectée automatiquement au build (`FIREBASE_WEBAPP_CONFIG`) ; rien à faire.
5. *(Optionnel)* **Domaine personnalisé** : dans les paramètres du backend, ajoute par exemple `formation.ecolemotion.com`, puis crée les enregistrements DNS indiqués.
6. Chaque push sur `main` déclenche un déploiement.

## 5. Compte formateur

```bash
gcloud auth application-default login
npm run make-creator -- --project <project-id> \
  --email theo@ecolemotion.com --name "Ecole Motion" --slug ecole-motion --color "#9d72f9"
```

Le formateur doit se déconnecter puis se reconnecter pour voir l'espace Admin.

## 6. Vimeo

Pour chaque vidéo de leçon :

1. **Confidentialité** : *Masquer de Vimeo* (non répertoriée).
2. **Où cette vidéo peut-elle être intégrée ?** *Domaines spécifiques*. Ajoute :
   - le domaine de la plateforme ;
   - `*.hosted.app` (URL App Hosting) ;
   - `localhost` pour le développement.
3. Copie le lien de la vidéo (avec son hash, par ex. `https://vimeo.com/123456789/abcdef1234`) dans l'éditeur de leçon.

⚠️ **À vérifier sur ton abonnement Vimeo** : la restriction par domaine n'est pas disponible sur toutes les offres. La grille Vimeo change en 2026 ; selon les sources, elle pourrait exiger l'offre *Core* ou supérieure.

## 7. Migration depuis Podia

1. Ré-uploade les vidéos sur Vimeo (télécharge les originaux depuis Podia si besoin).
2. Recrée la formation, les chapitres et les leçons dans *Admin > Formations*.
3. Exporte les clients depuis Podia (*Audience > Export*), puis dans la formation clique sur *Donner l'accès > Importer un CSV*.
   - Colonnes reconnues : `email`, `name`/`nom`, `signed up`/`date`.
   - Coche « Ne pas envoyer d'email » pour préparer la migration en silence.
   - Pour annoncer la nouvelle plateforme, adapte le modèle d'email de bienvenue, puis renvoie les accès.
4. Teste avec 2-3 élèves pilotes avant de basculer.
