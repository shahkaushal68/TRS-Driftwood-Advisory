#!/usr/bin/env bash
# Seeds the super-admin user.
# Credentials (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME) are
# read from the env file — no flags needed.
#
# Usage — local (reads from .env.development.local):
#   ./scripts/seed.sh
#
# Usage — production (credentials fetched from Secrets Manager at container startup):
#   ./scripts/seed.sh --production
#
# Prerequisites: AWS CLI v2, Admin permissions (production mode only)
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REGION="${AWS_REGION:-us-east-1}"
CLUSTER="driftwood-trs-dev"
SERVICE="driftwood-trs-dev"
PRODUCTION=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --cluster)    CLUSTER="$2";    shift 2 ;;
    --service)    SERVICE="$2";    shift 2 ;;
    --region)     REGION="$2";     shift 2 ;;
    --production) PRODUCTION=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Local mode — reads SUPER_ADMIN_* and DATABASE_URL from .env.development.local ──
if [[ "$PRODUCTION" == false ]]; then
  if [[ ! -f ".env.development.local" ]]; then
    echo "ERROR: .env.development.local not found"
    exit 1
  fi

  set -a
  # shellcheck source=/dev/null
  source ".env.development.local"
  set +a

  npm run seed:super-admin
  exit 0
fi

# ── Production mode (ECS one-off task) ────────────────────────────────────────
# SUPER_ADMIN_* are already in Secrets Manager (uploaded from .env.development).
# The entrypoint fetches and injects them before the seed command runs.
echo "Fetching task definition from service '${SERVICE}'..."
TASK_DEF=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query "services[0].taskDefinition" \
  --output text)
echo "Task definition: ${TASK_DEF}"

NETWORK_CONFIG=$(aws ecs describe-services \
  --cluster "$CLUSTER" \
  --services "$SERVICE" \
  --region "$REGION" \
  --query "services[0].networkConfiguration" \
  --output json)

CONTAINER_NAME=$(aws ecs describe-task-definition \
  --task-definition "$TASK_DEF" \
  --region "$REGION" \
  --query "taskDefinition.containerDefinitions[0].name" \
  --output text)

echo "Launching one-off seed task..."
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEF" \
  --launch-type FARGATE \
  --network-configuration "$NETWORK_CONFIG" \
  --overrides "{
    \"containerOverrides\": [{
      \"name\": \"${CONTAINER_NAME}\",
      \"command\": [\"node\", \"dist/scripts/seed-super-admin.js\"]
    }]
  }" \
  --region "$REGION" \
  --query "tasks[0].taskArn" \
  --output text)

echo "Seed task started: ${TASK_ARN}"
echo "Waiting for task to finish..."

aws ecs wait tasks-stopped \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION"

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$CLUSTER" \
  --tasks "$TASK_ARN" \
  --region "$REGION" \
  --query "tasks[0].containers[0].exitCode" \
  --output text)

TASK_ID="${TASK_ARN##*/}"
LOG_URL="https://${REGION}.console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/%2Fecs%2F${CLUSTER}/log-events/ecs%2F${CONTAINER_NAME}%2F${TASK_ID}"

if [[ "$EXIT_CODE" == "0" ]]; then
  echo ""
  echo "Super admin seeded successfully."
  echo "Logs: ${LOG_URL}"
else
  echo "ERROR: Seed task exited with code ${EXIT_CODE}"
  echo "Logs: ${LOG_URL}"
  exit 1
fi
