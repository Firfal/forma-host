#!/usr/bin/env bash
# Installe / met à jour l'extension « Trigger Email from Firestore » (SMTP Brevo).
# Variables : PROJECT_ID, REGION, SMTP_CONNECTION_URI, SMTP_PASSWORD, MAIL_FROM.
# Le manifeste d'extension est généré dans un dossier temporaire : le firebase.json du dépôt
# reste sans extension, pour que les émulateurs locaux ne tentent pas d'envoyer d'emails.
set -euo pipefail

INSTANCE=firestore-send-email
SECRET="ext-${INSTANCE}-SMTP_PASSWORD"

# Mot de passe SMTP dans Secret Manager (jamais écrit sur disque ni dans les logs).
if ! gcloud secrets describe "$SECRET" --project "$PROJECT_ID" > /dev/null 2>&1; then
  gcloud secrets create "$SECRET" --project "$PROJECT_ID" --replication-policy automatic \
    --labels firebase-extensions-managed=true
fi
printf '%s' "$SMTP_PASSWORD" | gcloud secrets versions add "$SECRET" --project "$PROJECT_ID" --data-file=- > /dev/null

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/extensions"
cat > "$WORKDIR/firebase.json" <<JSON
{ "extensions": { "${INSTANCE}": "firebase/firestore-send-email@0.2.10" } }
JSON
cat > "$WORKDIR/extensions/${INSTANCE}.env" <<ENV
DATABASE=(default)
DATABASE_REGION=${REGION}
AUTH_TYPE=UsernamePassword
SMTP_CONNECTION_URI=${SMTP_CONNECTION_URI}
SMTP_PASSWORD=projects/${PROJECT_ID}/secrets/${SECRET}/versions/latest
MAIL_COLLECTION=mail
DEFAULT_FROM=${MAIL_FROM}
TTL_EXPIRE_TYPE=never
TTL_EXPIRE_VALUE=1
firebaseextensions.v1beta.function/location=${REGION}
ENV

REPO_DIR=$(pwd)
cd "$WORKDIR"
"$REPO_DIR/node_modules/.bin/firebase" deploy --only extensions --project "$PROJECT_ID" --non-interactive --force
echo "✔ Extension ${INSTANCE} déployée"
