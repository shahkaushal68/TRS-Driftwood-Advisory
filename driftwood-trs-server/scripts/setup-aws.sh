#!/usr/bin/env bash
# One-shot idempotent AWS setup for driftwood-trs-server on ECS Fargate + ALB.
# Safe to re-run — existing resources are skipped, IAM policies are always upserted.
#
# What it creates (in order):
#   ECR repository → GitHub OIDC provider → 3 IAM roles → CloudWatch log group
#   → ECS cluster → Security groups (ALB + ECS) → ALB + target group + HTTP listener
#   → ECS task definition → ECS service
#
# Prerequisites:
#   - AWS CLI v2 with Admin permissions  (aws sts get-caller-identity)
#   - Run scripts/upload-secrets.sh first (secret must exist for task role policy)
#   - Git remote "origin" pointing to GitHub (for OIDC trust policy)
#
# Usage: ./scripts/setup-aws.sh
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
REGION="us-east-1"
APP_NAME="driftwood-trs-dev"
SERVICE_NAME="${APP_NAME}"
SECRET_NAME="driftwood-trs-dev"
ECR_REPO="${APP_NAME}"
ECS_CLUSTER="${APP_NAME}"
ECS_SERVICE="${SERVICE_NAME}"
TASK_FAMILY="${SERVICE_NAME}"
CONTAINER_NAME="${SERVICE_NAME}"
CONTAINER_PORT=8000
LOG_GROUP="/ecs/${SERVICE_NAME}"

ROLE_TASK_EXEC="${APP_NAME}-task-execution"
ROLE_TASK="${APP_NAME}-task-role"
ROLE_GITHUB="${APP_NAME}-github-deploy"

# ── Helpers ───────────────────────────────────────────────────────────────────
step()  { printf "\n\033[1;36m▶  %s\033[0m\n" "$1"; }
ok()    { printf "\033[0;32m   ✓  %s\033[0m\n" "$1"; }
skip()  { printf "\033[0;33m   →  %s (already exists, skipping)\033[0m\n" "$1"; }
warn()  { printf "\033[0;33m   ⚠  %s\033[0m\n" "$1"; }

# ── Detect GitHub repo ────────────────────────────────────────────────────────
GITHUB_REPO=$(git remote get-url origin 2>/dev/null \
  | sed -E 's|https://github\.com/||; s|git@[^:]+:||; s|\.git$||' || true)
if [[ -z "$GITHUB_REPO" ]]; then
  echo "ERROR: Could not detect GitHub repo from git remote."
  echo "       Set GITHUB_REPO=org/repo and re-run, or push this repo to GitHub first."
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  driftwood-trs AWS Setup"
echo "  Region:      ${REGION}"
echo "  GitHub repo: ${GITHUB_REPO}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Validate credentials + get account ID ──────────────────────────────────
step "AWS credentials"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
EXEC_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_TASK_EXEC}"
TASK_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_TASK}"
DEPLOY_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_GITHUB}"
ok "Account: ${ACCOUNT_ID} (${REGION})"

# ── 2. ECR repository ─────────────────────────────────────────────────────────
step "ECR repository: ${ECR_REPO}"
if aws ecr describe-repositories \
     --repository-names "$ECR_REPO" \
     --region "$REGION" > /dev/null 2>&1; then
  skip "$ECR_REPO"
else
  aws ecr create-repository \
    --repository-name "$ECR_REPO" \
    --region "$REGION" \
    --image-scanning-configuration scanOnPush=true \
    > /dev/null
  ok "Created: ${ECR_REGISTRY}/${ECR_REPO}"
fi
ECR_REPO_ARN="arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}"

# ── 3. GitHub OIDC provider ───────────────────────────────────────────────────
step "GitHub Actions OIDC provider"
if aws iam list-open-id-connect-providers --output json \
   | grep -q "token.actions.githubusercontent.com"; then
  skip "token.actions.githubusercontent.com"
  OIDC_ARN=$(aws iam list-open-id-connect-providers \
    --query "OpenIDConnectProviderList[?contains(Arn,'token.actions')].Arn" \
    --output text | head -1)
else
  OIDC_ARN=$(aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    --query "OpenIDConnectProviderArn" --output text)
  ok "Created OIDC provider"
fi
ok "ARN: ${OIDC_ARN}"

# ── Helper: create IAM role if missing ───────────────────────────────────────
create_role_if_missing() {
  local role_name=$1
  local trust_doc=$2
  if aws iam get-role --role-name "$role_name" > /dev/null 2>&1; then
    skip "Role: ${role_name}"
  else
    aws iam create-role \
      --role-name "$role_name" \
      --assume-role-policy-document "$trust_doc" \
      > /dev/null
    ok "Created role: ${role_name}"
  fi
}

ECS_TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

# ── 4. IAM: task execution role ───────────────────────────────────────────────
step "IAM: task execution role (${ROLE_TASK_EXEC})"
create_role_if_missing "$ROLE_TASK_EXEC" "$ECS_TRUST_POLICY"
# Attach AWS-managed policy — idempotent, errors only if already attached
aws iam attach-role-policy \
  --role-name "$ROLE_TASK_EXEC" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" \
  2>/dev/null || true
ok "AmazonECSTaskExecutionRolePolicy attached"

# ── 5. IAM: task role (app permissions: Secrets Manager) ──────────────────────
step "IAM: task role (${ROLE_TASK})"
create_role_if_missing "$ROLE_TASK" "$ECS_TRUST_POLICY"

# Upsert inline policy — always overwrite to stay correct on re-runs
aws iam put-role-policy \
  --role-name "$ROLE_TASK" \
  --policy-name "SecretsManagerAccess" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": \"secretsmanager:GetSecretValue\",
      \"Resource\": \"arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:${SECRET_NAME}*\"
    }]
  }"
ok "Upserted SecretsManagerAccess policy"

# ── 6. IAM: GitHub deploy role ────────────────────────────────────────────────
step "IAM: GitHub deploy role (${ROLE_GITHUB})"

GITHUB_TRUST=$(cat << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Federated": "${OIDC_ARN}"},
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
      }
    }
  }]
}
EOF
)

create_role_if_missing "$ROLE_GITHUB" "$GITHUB_TRUST"

# Always upsert deploy policy so it stays current on re-runs
aws iam put-role-policy \
  --role-name "$ROLE_GITHUB" \
  --policy-name "GitHubDeployPolicy" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"ECRAuth\",
        \"Effect\": \"Allow\",
        \"Action\": \"ecr:GetAuthorizationToken\",
        \"Resource\": \"*\"
      },
      {
        \"Sid\": \"ECRPush\",
        \"Effect\": \"Allow\",
        \"Action\": [
          \"ecr:BatchCheckLayerAvailability\",
          \"ecr:GetDownloadUrlForLayer\",
          \"ecr:BatchGetImage\",
          \"ecr:InitiateLayerUpload\",
          \"ecr:UploadLayerPart\",
          \"ecr:CompleteLayerUpload\",
          \"ecr:PutImage\",
          \"ecr:DescribeRepositories\",
          \"ecr:CreateRepository\"
        ],
        \"Resource\": \"${ECR_REPO_ARN}\"
      },
      {
        \"Sid\": \"ECSTaskDef\",
        \"Effect\": \"Allow\",
        \"Action\": [
          \"ecs:RegisterTaskDefinition\",
          \"ecs:DescribeTaskDefinition\"
        ],
        \"Resource\": \"*\"
      },
      {
        \"Sid\": \"ECSDeploy\",
        \"Effect\": \"Allow\",
        \"Action\": [
          \"ecs:UpdateService\",
          \"ecs:DescribeServices\"
        ],
        \"Resource\": \"arn:aws:ecs:${REGION}:${ACCOUNT_ID}:service/${ECS_CLUSTER}/${ECS_SERVICE}\"
      },
      {
        \"Sid\": \"PassRoleToECS\",
        \"Effect\": \"Allow\",
        \"Action\": \"iam:PassRole\",
        \"Resource\": [
          \"${EXEC_ROLE_ARN}\",
          \"${TASK_ROLE_ARN}\"
        ]
      }
    ]
  }"
ok "Upserted GitHubDeployPolicy"

# ── 7. CloudWatch log group ───────────────────────────────────────────────────
step "CloudWatch log group: ${LOG_GROUP}"
if aws logs describe-log-groups \
     --log-group-name-prefix "$LOG_GROUP" \
     --region "$REGION" \
     --query "logGroups[?logGroupName=='${LOG_GROUP}'].logGroupName" \
     --output text | grep -q "$LOG_GROUP" 2>/dev/null; then
  skip "$LOG_GROUP"
else
  aws logs create-log-group \
    --log-group-name "$LOG_GROUP" \
    --region "$REGION"
  aws logs put-retention-policy \
    --log-group-name "$LOG_GROUP" \
    --retention-in-days 30 \
    --region "$REGION"
  ok "Created (30-day retention)"
fi

# ── 8. ECS cluster ────────────────────────────────────────────────────────────
step "ECS cluster: ${ECS_CLUSTER}"
if aws ecs describe-clusters \
     --clusters "$ECS_CLUSTER" \
     --region "$REGION" \
     --query "clusters[?status=='ACTIVE'].clusterName" \
     --output text | grep -q "$ECS_CLUSTER"; then
  skip "$ECS_CLUSTER"
else
  aws ecs create-cluster \
    --cluster-name "$ECS_CLUSTER" \
    --region "$REGION" \
    > /dev/null
  ok "Created cluster: ${ECS_CLUSTER}"
fi

# ── 9. Networking: default VPC + public subnets ───────────────────────────────
step "Networking (default VPC, ${REGION})"
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query "Vpcs[0].VpcId" --output text)

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "ERROR: No default VPC found in ${REGION}. Create one with:"
  echo "       aws ec2 create-default-vpc --region ${REGION}"
  exit 1
fi
ok "VPC: ${VPC_ID}"

# ALB needs >= 2 subnets across different AZs
SUBNET_IDS_RAW=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" "Name=mapPublicIpOnLaunch,Values=true" \
  --region "$REGION" \
  --query "Subnets[*].SubnetId" \
  --output text)

SUBNET_IDS=($SUBNET_IDS_RAW)
SUBNET_COUNT=${#SUBNET_IDS[@]}
ok "Public subnets: ${SUBNET_COUNT} found"

if [[ "$SUBNET_COUNT" -lt 2 ]]; then
  echo "ERROR: ALB requires >= 2 public subnets in different AZs. Found ${SUBNET_COUNT}."
  exit 1
fi

# ── 10. Security groups ────────────────────────────────────────────────────────
step "Security groups"

ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${APP_NAME}-alb-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --region "$REGION" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")

if [[ -z "$ALB_SG" || "$ALB_SG" == "None" ]]; then
  ALB_SG=$(aws ec2 create-security-group \
    --group-name "${APP_NAME}-alb-sg" \
    --description "ALB for ${APP_NAME}" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query "GroupId" --output text)
  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG" --protocol tcp --port 80  --cidr 0.0.0.0/0 --region "$REGION" > /dev/null
  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0 --region "$REGION" > /dev/null
  ok "Created ALB SG: ${ALB_SG} (ports 80, 443 open)"
else
  skip "ALB SG: ${ALB_SG}"
fi

ECS_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${APP_NAME}-ecs-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --region "$REGION" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")

if [[ -z "$ECS_SG" || "$ECS_SG" == "None" ]]; then
  ECS_SG=$(aws ec2 create-security-group \
    --group-name "${APP_NAME}-ecs-sg" \
    --description "ECS tasks for ${APP_NAME}" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query "GroupId" --output text)
  # Only allow traffic from the ALB — tasks are not directly reachable
  aws ec2 authorize-security-group-ingress \
    --group-id "$ECS_SG" \
    --protocol tcp \
    --port "$CONTAINER_PORT" \
    --source-group "$ALB_SG" \
    --region "$REGION" > /dev/null
  ok "Created ECS SG: ${ECS_SG} (port ${CONTAINER_PORT} from ALB only)"
else
  skip "ECS SG: ${ECS_SG}"
fi

# ── 11. Application Load Balancer ──────────────────────────────────────────────
step "Application Load Balancer: ${APP_NAME}-alb"

ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names "${APP_NAME}-alb" \
  --region "$REGION" \
  --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null || echo "")

if [[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]]; then
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name "${APP_NAME}-alb" \
    --subnets "${SUBNET_IDS[@]}" \
    --security-groups "$ALB_SG" \
    --scheme internet-facing \
    --type application \
    --region "$REGION" \
    --query "LoadBalancers[0].LoadBalancerArn" --output text)
  ok "Created ALB"
else
  skip "ALB: ${APP_NAME}-alb"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --region "$REGION" \
  --query "LoadBalancers[0].DNSName" --output text)
ok "DNS: ${ALB_DNS}"

# Target group (type=ip required for Fargate awsvpc networking)
TG_ARN=$(aws elbv2 describe-target-groups \
  --names "${APP_NAME}-tg" \
  --region "$REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null || echo "")

if [[ -z "$TG_ARN" || "$TG_ARN" == "None" ]]; then
  TG_ARN=$(aws elbv2 create-target-group \
    --name "${APP_NAME}-tg" \
    --protocol HTTP \
    --port "$CONTAINER_PORT" \
    --vpc-id "$VPC_ID" \
    --target-type ip \
    --health-check-path "/api/health" \
    --health-check-interval-seconds 30 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$REGION" \
    --query "TargetGroups[0].TargetGroupArn" --output text)
  ok "Created target group (health check: /api/health)"
else
  skip "Target group: ${APP_NAME}-tg"
fi

# HTTP listener on port 80
LISTENER_EXISTS=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query "Listeners[?Port==\`80\`].ListenerArn" \
  --output text 2>/dev/null || echo "")

if [[ -z "$LISTENER_EXISTS" ]]; then
  aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP --port 80 \
    --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
    --region "$REGION" > /dev/null
  ok "Created HTTP listener (port 80)"
else
  skip "HTTP listener"
fi

# ── 12. ECS task definition ────────────────────────────────────────────────────
step "ECS task definition: ${TASK_FAMILY}"
IMAGE_URI="${ECR_REGISTRY}/${ECR_REPO}:latest"

TMP_TASK_DEF=$(mktemp /tmp/task-def-XXXXXX.json)
trap 'rm -f "$TMP_TASK_DEF"' EXIT

cat > "$TMP_TASK_DEF" << EOF
{
  "family": "${TASK_FAMILY}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [{
    "name": "${CONTAINER_NAME}",
    "image": "${IMAGE_URI}",
    "essential": true,
    "portMappings": [{"containerPort": ${CONTAINER_PORT}, "protocol": "tcp"}],
    "environment": [
      {"name": "NODE_ENV",           "value": "production"},
      {"name": "PORT",               "value": "${CONTAINER_PORT}"},
      {"name": "AWS_SECRET_ID",      "value": "${SECRET_NAME}"},
      {"name": "AWS_DEFAULT_REGION", "value": "${REGION}"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group":         "${LOG_GROUP}",
        "awslogs-region":        "${REGION}",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
EOF

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json "file://${TMP_TASK_DEF}" \
  --region "$REGION" \
  --query "taskDefinition.taskDefinitionArn" \
  --output text)
ok "Registered: ${TASK_DEF_ARN}"

# ── 13. ECS service ───────────────────────────────────────────────────────────
step "ECS service: ${ECS_SERVICE}"

SERVICE_ACTIVE=$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$REGION" \
  --query "services[?status=='ACTIVE'].serviceName" \
  --output text 2>/dev/null || echo "")

if echo "$SERVICE_ACTIVE" | grep -q "$ECS_SERVICE"; then
  skip "Service: ${ECS_SERVICE}"
else
  SUBNETS_CSV=$(IFS=','; echo "${SUBNET_IDS[*]}")
  aws ecs create-service \
    --cluster "$ECS_CLUSTER" \
    --service-name "$ECS_SERVICE" \
    --task-definition "$TASK_FAMILY" \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS_CSV}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=${TG_ARN},containerName=${CONTAINER_NAME},containerPort=${CONTAINER_PORT}" \
    --health-check-grace-period-seconds 60 \
    --region "$REGION" \
    > /dev/null
  ok "Created service (desired: 1)"
  warn "Service is PENDING — it will stay unhealthy until the first image is pushed via GitHub Release"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  App URL (HTTP):  http://${ALB_DNS}"
echo "  Logs:            CloudWatch > ${LOG_GROUP}"
echo ""
echo "  ── Set these as GitHub repository variables ──────────────────"
echo "  AWS_DEPLOY_ROLE_ARN  = ${DEPLOY_ROLE_ARN}"
echo "  AWS_REGION           = ${REGION}"
echo "  ECR_REPO_NAME        = ${ECR_REPO}"
echo "  ECS_CLUSTER          = ${ECS_CLUSTER}"
echo "  ECS_SERVICE          = ${ECS_SERVICE}"
echo "  ECS_TASK_FAMILY      = ${TASK_FAMILY}"
echo "  ECS_CONTAINER_NAME   = ${CONTAINER_NAME}"
echo ""
echo "  ── Next steps ────────────────────────────────────────────────"
echo "  1. Set the 7 GitHub repo variables above"
echo "     (Settings → Secrets and variables → Actions → Variables)"
echo "  2. Create a GitHub Release (tag v1.0.0) to trigger the first deploy"
echo "  3. Watch the service go healthy in ECS console"
echo "  4. (Optional) Add HTTPS:"
echo "     ./scripts/setup-https.sh --domain your-domain.com"
echo "     ./scripts/setup-https.sh --domain your-domain.com --redirect-http"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
