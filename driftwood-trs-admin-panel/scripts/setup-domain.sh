#!/usr/bin/env bash
# Idempotent custom domain setup for the driftwood-trs-dev-admin CloudFront distribution.
# Safe to re-run — ACM certificate is reused if already issued.
#
# What it does:
#   1. Looks up the CloudFront distribution by comment
#   2. Requests an ACM certificate in us-east-1 (required by CloudFront)
#   3. Prints the CNAME record for DNS validation and polls until issued
#   4. Attaches the custom domain alias + certificate to the distribution
#   5. Prints the CNAME record to point your domain to CloudFront
#
# Usage:
#   ./scripts/setup-domain.sh --domain driftwood-trs-dev-admin.godatanova.com
#
# Prerequisites:
#   - AWS CLI v2 with Admin permissions
#   - python3 (pre-installed on macOS and GitHub Actions ubuntu-latest)
#   - CloudFront distribution already exists (run scripts/setup-aws.sh first)
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
APP_NAME="driftwood-trs-dev-admin"
CF_COMMENT="${APP_NAME}"
# ACM for CloudFront MUST always be in us-east-1, regardless of S3 bucket region
ACM_REGION="us-east-1"
DOMAIN=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 --domain <your-domain>"
  echo "Example: $0 --domain driftwood-trs-dev-admin.godatanova.com"
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
step() { printf "\n\033[1;36m▶  %s\033[0m\n" "$1"; }
ok()   { printf "\033[0;32m   ✓  %s\033[0m\n" "$1"; }
skip() { printf "\033[0;33m   →  %s (already exists, skipping)\033[0m\n" "$1"; }
warn() { printf "\033[0;33m   ⚠  %s\033[0m\n" "$1"; }

# ── Temp file cleanup ─────────────────────────────────────────────────────────
TMPFILES=()
cleanup() { rm -f "${TMPFILES[@]}"; }
trap cleanup EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Custom domain setup — ${APP_NAME}"
echo "  Domain: ${DOMAIN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Look up CloudFront distribution ────────────────────────────────────────
step "Looking up CloudFront distribution (comment: ${CF_COMMENT})"

DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='${CF_COMMENT}'].Id" \
  --output text 2>/dev/null | head -1 || echo "")

if [[ -z "$DIST_ID" || "$DIST_ID" == "None" ]]; then
  echo "ERROR: CloudFront distribution with comment '${CF_COMMENT}' not found."
  echo "       Run scripts/setup-aws.sh first."
  exit 1
fi

CF_DOMAIN=$(aws cloudfront get-distribution \
  --id "$DIST_ID" \
  --query "Distribution.DomainName" --output text)

ok "Distribution: ${DIST_ID}"
ok "CloudFront domain: ${CF_DOMAIN}"

# ── 2. ACM certificate (must be in us-east-1) ─────────────────────────────────
step "ACM certificate for: ${DOMAIN} (region: ${ACM_REGION})"

CERT_ARN=$(aws acm list-certificates \
  --region "$ACM_REGION" \
  --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn" \
  --output text 2>/dev/null | head -1 || echo "")

if [[ -n "$CERT_ARN" && "$CERT_ARN" != "None" ]]; then
  CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$ACM_REGION" \
    --query "Certificate.Status" \
    --output text)

  if [[ "$CERT_STATUS" == "ISSUED" ]]; then
    skip "Certificate already ISSUED: ${CERT_ARN}"
  else
    ok "Found existing certificate (status: ${CERT_STATUS}): ${CERT_ARN}"
  fi
else
  CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN" \
    --validation-method DNS \
    --region "$ACM_REGION" \
    --query "CertificateArn" \
    --output text)
  ok "Requested new certificate: ${CERT_ARN}"
fi

# ── 3. DNS validation ──────────────────────────────────────────────────────────
CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$ACM_REGION" \
  --query "Certificate.Status" \
  --output text)

if [[ "$CERT_STATUS" != "ISSUED" ]]; then
  # Give ACM a moment to generate the validation record
  sleep 3

  DNS_RECORD=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$ACM_REGION" \
    --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
    --output json)

  CNAME_NAME=$(echo "$DNS_RECORD"  | grep -o '"Name": *"[^"]*"'  | head -1 | sed 's/.*": *"//; s/"//')
  CNAME_VALUE=$(echo "$DNS_RECORD" | grep -o '"Value": *"[^"]*"' | head -1 | sed 's/.*": *"//; s/"//')

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ACTION REQUIRED — add this DNS validation record:"
  echo "  (DNS-only / gray cloud, NOT proxied)"
  echo ""
  printf "  Type:  CNAME\n"
  printf "  Name:  %s\n" "$CNAME_NAME"
  printf "  Value: %s\n" "$CNAME_VALUE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "  Waiting for certificate to be issued (checking every 15s)..."
  echo "  Press Ctrl+C to abort — re-run this script later to continue."
  echo ""

  while true; do
    CERT_STATUS=$(aws acm describe-certificate \
      --certificate-arn "$CERT_ARN" \
      --region "$ACM_REGION" \
      --query "Certificate.Status" \
      --output text)

    if [[ "$CERT_STATUS" == "ISSUED" ]]; then
      ok "Certificate issued!"
      break
    fi

    printf "   status=%s — retrying in 15s\n" "$CERT_STATUS"
    sleep 15
  done
fi

# ── 4. Attach domain alias + certificate to CloudFront ────────────────────────
step "Attaching domain alias + certificate to CloudFront distribution"

EXISTING_ALIAS=$(aws cloudfront get-distribution \
  --id "$DIST_ID" \
  --query "Distribution.DistributionConfig.Aliases.Items" \
  --output text 2>/dev/null | grep -w "$DOMAIN" || echo "")

if [[ -n "$EXISTING_ALIAS" ]]; then
  skip "Alias ${DOMAIN} already attached"
else
  TMP_FULL=$(mktemp /tmp/cf-full-XXXXXX.json)
  TMP_UPDATED=$(mktemp /tmp/cf-updated-XXXXXX.json)
  TMP_PY=$(mktemp /tmp/update-cf-XXXXXX.py)
  TMPFILES+=("$TMP_FULL" "$TMP_UPDATED" "$TMP_PY")

  # Fetch current config + ETag (required for optimistic locking)
  ETAG=$(aws cloudfront get-distribution-config --id "$DIST_ID" --query "ETag" --output text)
  aws cloudfront get-distribution-config --id "$DIST_ID" > "$TMP_FULL"

  # Use python3 to splice in the alias + ACM cert — the config JSON is too
  # complex to manipulate safely with sed/grep
  cat > "$TMP_PY" << 'PYEOF'
import json, sys

full_path, domain, cert_arn, out_path = sys.argv[1:]

with open(full_path) as f:
    full = json.load(f)

dc = full["DistributionConfig"]
dc["Aliases"] = {"Quantity": 1, "Items": [domain]}
dc["ViewerCertificate"] = {
    "ACMCertificateArn": cert_arn,
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
}

with open(out_path, "w") as f:
    json.dump(dc, f)
PYEOF

  python3 "$TMP_PY" "$TMP_FULL" "$DOMAIN" "$CERT_ARN" "$TMP_UPDATED"

  aws cloudfront update-distribution \
    --id "$DIST_ID" \
    --distribution-config "file://${TMP_UPDATED}" \
    --if-match "$ETAG" \
    > /dev/null

  ok "Distribution updated — deploying (~5 min)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Domain setup complete!"
echo ""
echo "  URL:         https://${DOMAIN}"
echo "  Certificate: ${CERT_ARN}"
echo ""
echo "  ── Add this DNS record to point your domain to CloudFront ────"
printf "  Type:  CNAME\n"
printf "  Name:  %s\n" "$DOMAIN"
printf "  Value: %s\n" "$CF_DOMAIN"
echo "  (Cloudflare: orange cloud ON for CDN, or gray cloud for DNS-only)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
