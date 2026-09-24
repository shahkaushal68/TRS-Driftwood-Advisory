#!/usr/bin/env bash
# One-shot idempotent AWS setup for driftwood-trs-admin-panel on S3 + CloudFront.
# Safe to re-run — existing resources are skipped, IAM policies are always upserted.
#
# What it creates (in order):
#   S3 bucket → CloudFront Origin Access Control → CloudFront distribution
#   → S3 bucket policy → GitHub OIDC provider → GitHub deploy IAM role
#
# Prerequisites:
#   - AWS CLI v2 with Admin permissions  (aws sts get-caller-identity)
#   - Git remote "origin" pointing to GitHub (for OIDC trust policy)
#
# Usage: ./scripts/setup-aws.sh
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
REGION="us-east-1"
APP_NAME="driftwood-trs-dev-admin"
BUCKET="${APP_NAME}"
OAC_NAME="${APP_NAME}-oac"
CF_COMMENT="${APP_NAME}"

ROLE_GITHUB="${APP_NAME}-github-deploy"

# ── Helpers ───────────────────────────────────────────────────────────────────
step()  { printf "\n\033[1;36m▶  %s\033[0m\n" "$1"; }
ok()    { printf "\033[0;32m   ✓  %s\033[0m\n" "$1"; }
skip()  { printf "\033[0;33m   →  %s (already exists, skipping)\033[0m\n" "$1"; }
warn()  { printf "\033[0;33m   ⚠  %s\033[0m\n" "$1"; }

# ── Temp file cleanup ─────────────────────────────────────────────────────────
TMPFILES=()
cleanup() { rm -f "${TMPFILES[@]}"; }
trap cleanup EXIT

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
echo "  driftwood-trs-admin-panel AWS Setup"
echo "  Region:      ${REGION}"
echo "  GitHub repo: ${GITHUB_REPO}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Validate credentials + get account ID ──────────────────────────────────
step "AWS credentials"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
DEPLOY_ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_GITHUB}"
ok "Account: ${ACCOUNT_ID} (${REGION})"

# ── 2. S3 bucket ──────────────────────────────────────────────────────────────
step "S3 bucket: ${BUCKET}"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  skip "$BUCKET"
else
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" > /dev/null
  else
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" > /dev/null
  fi
  aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --public-access-block-configuration \
      "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  ok "Created: s3://${BUCKET} (public access blocked)"
fi
BUCKET_DOMAIN="${BUCKET}.s3.${REGION}.amazonaws.com"

# ── 3. CloudFront Origin Access Control ───────────────────────────────────────
step "CloudFront Origin Access Control: ${OAC_NAME}"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id" \
  --output text 2>/dev/null | head -1 || echo "")

if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "{
      \"Name\": \"${OAC_NAME}\",
      \"Description\": \"OAC for ${APP_NAME}\",
      \"SigningProtocol\": \"sigv4\",
      \"SigningBehavior\": \"always\",
      \"OriginAccessControlOriginType\": \"s3\"
    }" \
    --query "OriginAccessControl.Id" --output text)
  ok "Created OAC: ${OAC_ID}"
else
  skip "OAC: ${OAC_ID}"
fi

# ── 4. CloudFront distribution ────────────────────────────────────────────────
step "CloudFront distribution"
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${CF_COMMENT}'].Id" \
  --output text 2>/dev/null | head -1 || echo "")

if [[ -z "$DIST_ID" || "$DIST_ID" == "None" ]]; then
  TMP_CF=$(mktemp /tmp/cf-config-XXXXXX.json)
  TMPFILES+=("$TMP_CF")

  cat > "$TMP_CF" << EOF
{
  "CallerReference": "${APP_NAME}-$(date +%s)",
  "Comment": "${CF_COMMENT}",
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-origin",
      "DomainName": "${BUCKET_DOMAIN}",
      "S3OriginConfig": {"OriginAccessIdentity": ""},
      "OriginAccessControlId": "${OAC_ID}"
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "Compress": true,
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    }
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 403,
        "ResponseCode": "200",
        "ResponsePagePath": "/index.html",
        "ErrorCachingMinTTL": 0
      },
      {
        "ErrorCode": 404,
        "ResponseCode": "200",
        "ResponsePagePath": "/index.html",
        "ErrorCachingMinTTL": 0
      }
    ]
  },
  "ViewerCertificate": {
    "CloudFrontDefaultCertificate": true
  },
  "HttpVersion": "http2and3",
  "Enabled": true
}
EOF

  DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "file://${TMP_CF}" \
    --query "Distribution.Id" --output text)
  ok "Created distribution: ${DIST_ID}"
  warn "Distribution is deploying (~5–10 min) — you can run the first deploy while it propagates"
else
  skip "Distribution: ${DIST_ID}"
fi

CF_DOMAIN=$(aws cloudfront get-distribution \
  --id "$DIST_ID" \
  --query "Distribution.DomainName" --output text)
ok "CloudFront URL: https://${CF_DOMAIN}"

# ── 5. S3 bucket policy — allow CloudFront OAC ───────────────────────────────
step "S3 bucket policy"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"AllowCloudFrontServicePrincipal\",
    \"Effect\": \"Allow\",
    \"Principal\": {\"Service\": \"cloudfront.amazonaws.com\"},
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::${BUCKET}/*\",
    \"Condition\": {
      \"StringEquals\": {
        \"AWS:SourceArn\": \"arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}\"
      }
    }
  }]
}"
ok "Bucket policy set (CloudFront OAC access only)"

# ── 6. GitHub OIDC provider ───────────────────────────────────────────────────
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

# ── 7. IAM: GitHub deploy role ────────────────────────────────────────────────
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

# Upsert deploy policy — always overwrite to stay correct on re-runs
aws iam put-role-policy \
  --role-name "$ROLE_GITHUB" \
  --policy-name "GitHubDeployPolicy" \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"S3Sync\",
        \"Effect\": \"Allow\",
        \"Action\": [
          \"s3:PutObject\",
          \"s3:DeleteObject\",
          \"s3:GetObject\",
          \"s3:ListBucket\",
          \"s3:GetBucketLocation\"
        ],
        \"Resource\": [
          \"arn:aws:s3:::${BUCKET}\",
          \"arn:aws:s3:::${BUCKET}/*\"
        ]
      },
      {
        \"Sid\": \"CloudFrontInvalidate\",
        \"Effect\": \"Allow\",
        \"Action\": \"cloudfront:CreateInvalidation\",
        \"Resource\": \"arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}\"
      }
    ]
  }"
ok "Upserted GitHubDeployPolicy"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Site URL (CloudFront): https://${CF_DOMAIN}"
echo ""
echo "  ── Set these as GitHub repository variables ──────────────────"
echo "  AWS_DEPLOY_ROLE_ARN          = ${DEPLOY_ROLE_ARN}"
echo "  AWS_REGION                   = ${REGION}"
echo "  S3_BUCKET_NAME               = ${BUCKET}"
echo "  CLOUDFRONT_DISTRIBUTION_ID   = ${DIST_ID}"
echo ""
echo "  ── Next steps ────────────────────────────────────────────────"
echo "  1. Set the 4 GitHub repo variables above"
echo "     (Settings → Secrets and variables → Actions → Variables)"
echo "  2. Create a GitHub Release (tag v1.0.0) to trigger the first deploy"
echo "  3. Add a custom domain:"
echo "     ./scripts/setup-domain.sh --domain driftwood-trs-dev-admin.godatanova.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
