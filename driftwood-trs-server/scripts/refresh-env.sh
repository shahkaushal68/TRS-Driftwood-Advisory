#!/usr/bin/env bash
# Uploads .env.development.local to AWS Secrets Manager and forces a new ECS
# deployment so the running container picks up the updated environment.
#
# Usage:
#   ./scripts/refresh-env.sh
#   ./scripts/refresh-env.sh --no-wait
#   ./scripts/refresh-env.sh --dry-run
#   ./scripts/refresh-env.sh --env-file .env.staging
#
# Prerequisites: AWS CLI v2, Node.js, Admin permissions
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
SECRET_NAME="${SECRET_NAME:-driftwood-trs-dev}"
CLUSTER="driftwood-trs-dev"
SERVICE="driftwood-trs-dev"
ENV_FILE=".env.development"
WAIT=true
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)    ENV_FILE="$2";    shift 2 ;;
    --secret-name) SECRET_NAME="$2"; shift 2 ;;
    --region)      REGION="$2";      shift 2 ;;
    --no-wait)     WAIT=false;       shift ;;
    --dry-run)     DRY_RUN=true;     shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done


SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Step 1: Upload secrets to AWS Secrets Manager ─────────────────────────────
echo "==> Uploading secrets from ${ENV_FILE}..."
UPLOAD_ARGS=("--env-file" "$ENV_FILE" "--secret-name" "$SECRET_NAME" "--region" "$REGION")
[[ "$DRY_RUN" == true ]] && UPLOAD_ARGS+=("--dry-run")
"$SCRIPT_DIR/upload-secrets.sh" "${UPLOAD_ARGS[@]}"

if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "[dry-run] Would force new ECS deployment for service '${SERVICE}' in cluster '${CLUSTER}'"
  exit 0
fi

# ── Step 2: Force a new ECS deployment ────────────────────────────────────────
echo ""
echo "==> Forcing new ECS deployment for service '${SERVICE}' in cluster '${CLUSTER}'..."
aws ecs update-service \
  --cluster "$CLUSTER" \
  --service "$SERVICE" \
  --force-new-deployment \
  --region "$REGION" \
  --output text > /dev/null

echo "Deployment triggered."

if [[ "$WAIT" == false ]]; then
  echo "Skipping wait — run the following to check status:"
  echo "  aws ecs describe-services --cluster ${CLUSTER} --services ${SERVICE} --region ${REGION} --query 'services[0].deployments'"
  exit 0
fi

echo "Waiting for service to stabilize (this may take a few minutes)..."
aws ecs wait services-stable \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION"

echo ""
echo "Service is stable. Updated environment is live."
