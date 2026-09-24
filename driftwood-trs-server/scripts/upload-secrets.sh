#!/usr/bin/env bash
# Creates or updates the AWS Secrets Manager secret from a .env file.
# All keys become a single JSON blob — fetched at container startup by fetch-aws-secrets.mjs.
#
# Usage:
#   ./scripts/upload-secrets.sh                          # uses .env.development + default secret name
#   ./scripts/upload-secrets.sh --env-file .env.staging  # custom env file
#   ./scripts/upload-secrets.sh --secret-name my/secret  # custom secret name
#   ./scripts/upload-secrets.sh --dry-run                # print JSON, don't upload
#
# Prerequisites: AWS CLI v2, Node.js, Admin permissions
set -euo pipefail

# ── Defaults (overridable via flags or env vars) ───────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
SECRET_NAME="${SECRET_NAME:-driftwood-trs-dev}"
ENV_FILE=".env.development"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)    ENV_FILE="$2";    shift 2 ;;
    --secret-name) SECRET_NAME="$2"; shift 2 ;;
    --region)      REGION="$2";      shift 2 ;;
    --dry-run)     DRY_RUN=true;     shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE"
  exit 1
fi

# ── Parse .env → JSON using Node.js ───────────────────────────────────────────
TMP_JS=$(mktemp /tmp/parse-env-XXXXXX.js)
trap 'rm -f "$TMP_JS"' EXIT

cat > "$TMP_JS" << 'JSEOF'
const fs = require('fs');
const envFile = process.argv[2];
const lines = fs.readFileSync(envFile, 'utf8').split('\n');
const obj = {};
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let value = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (key) obj[key] = value;
}
const json = JSON.stringify(obj);
const count = Object.keys(obj).length;
process.stderr.write(`Parsed ${count} keys from ${envFile}\n`);
process.stdout.write(json);
JSEOF

SECRET_JSON=$(node "$TMP_JS" "$ENV_FILE")

if [[ "$DRY_RUN" == true ]]; then
  echo "$SECRET_JSON" | node -e "
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => {
      console.log(JSON.stringify(JSON.parse(chunks.join('')), null, 2));
    });
  "
  echo ""
  echo "[dry-run] Would create/update secret '${SECRET_NAME}' in ${REGION}"
  exit 0
fi

# ── Create or update the secret ───────────────────────────────────────────────
if aws secretsmanager describe-secret \
     --secret-id "$SECRET_NAME" \
     --region "$REGION" \
     --output text > /dev/null 2>&1; then
  echo "Secret '${SECRET_NAME}' exists — updating..."
  ARN=$(aws secretsmanager update-secret \
    --secret-id "$SECRET_NAME" \
    --secret-string "$SECRET_JSON" \
    --region "$REGION" \
    --query "ARN" --output text)
  echo "Updated: ${ARN}"
else
  echo "Creating secret '${SECRET_NAME}'..."
  ARN=$(aws secretsmanager create-secret \
    --name "$SECRET_NAME" \
    --description "driftwood-trs-server production environment variables" \
    --secret-string "$SECRET_JSON" \
    --region "$REGION" \
    --query "ARN" --output text)
  echo "Created: ${ARN}"
fi

echo ""
echo "Secret ARN: ${ARN}"
echo "Secret name to set in ECS task definition: AWS_SECRET_ID=${SECRET_NAME}"
