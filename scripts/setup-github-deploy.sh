#!/usr/bin/env bash
# Autorise le workflow GitHub « Déploiement Firebase » à déployer sur le projet, sans clé JSON
# (Workload Identity Federation). À lancer une fois dans Google Cloud Shell :
#   https://shell.cloud.google.com/?project=forma-host
# Idempotent : peut être relancé sans risque.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-forma-host}"
REPO="${REPO:-Firfal/forma-host}"
SA_NAME="github-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL="github"
PROVIDER="forma-host-repo"

gcloud config set project "$PROJECT_ID" > /dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "→ APIs nécessaires"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  cloudresourcemanager.googleapis.com serviceusage.googleapis.com

echo "→ Compte de service ${SA_EMAIL}"
gcloud iam service-accounts describe "$SA_EMAIL" > /dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub Actions (déploiement)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --condition=None \
  --member="serviceAccount:${SA_EMAIL}" --role="roles/owner" > /dev/null

echo "→ Fédération d'identité GitHub"
gcloud iam workload-identity-pools describe "$POOL" --location=global > /dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"
# Seul le workflow de déploiement de ce dépôt peut utiliser le compte de service.
CONDITION="assertion.repository=='${REPO}' && assertion.job_workflow_ref.startsWith('${REPO}/.github/workflows/deploy.yml@')"
if gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global \
  --workload-identity-pool="$POOL" > /dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" --attribute-condition="$CONDITION" > /dev/null
else
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global \
    --workload-identity-pool="$POOL" --display-name="Dépôt ${REPO}" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="$CONDITION"
fi
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  > /dev/null

echo
echo "✔ Terminé. Numéro de projet à communiquer : ${PROJECT_NUMBER}"
