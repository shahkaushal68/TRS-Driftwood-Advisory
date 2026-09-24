#!/usr/bin/env bash
# Idempotent HTTPS setup for the driftwood-trs-dev ALB.
# Safe to re-run and safe to use when swapping to a new domain — it updates
# the existing HTTPS listener's certificate rather than creating a duplicate.
#
# What it does:
#   1. Requests an ACM certificate for the domain (DNS validation)
#   2. Prints the CNAME record to add in your DNS provider (gray cloud / DNS-only)
#   3. Polls until the certificate is issued
#   4. Opens port 443 on the ALB security group (idempotent)
#   5. Creates the HTTPS listener — or updates the cert if one already exists
#   6. Optionally configures HTTP (port 80) → HTTPS redirect
#
# Usage:
#   ./scripts/setup-https.sh --domain api.example.com
#   ./scripts/setup-https.sh --domain api.example.com --redirect-http
#
# Prerequisites:
#   - AWS CLI v2 with Admin permissions
#   - ALB already exists (run scripts/setup-aws.sh first)
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REGION="us-east-1"
APP_NAME="driftwood-trs-dev"
DOMAIN=""
REDIRECT_HTTP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)        DOMAIN="$2";  shift 2 ;;
    --region)        REGION="$2";  shift 2 ;;
    --redirect-http) REDIRECT_HTTP=true; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 --domain <your-domain> [--redirect-http]"
  echo "Example: $0 --domain api.example.com --redirect-http"
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────
step() { printf "\n\033[1;36m▶  %s\033[0m\n" "$1"; }
ok()   { printf "\033[0;32m   ✓  %s\033[0m\n" "$1"; }
skip() { printf "\033[0;33m   →  %s (already exists, skipping)\033[0m\n" "$1"; }
warn() { printf "\033[0;33m   ⚠  %s\033[0m\n" "$1"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  HTTPS Setup — ${APP_NAME}"
echo "  Domain: ${DOMAIN}"
echo "  Region: ${REGION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Look up ALB ─────────────────────────────────────────────────────────────
step "Looking up ALB: ${APP_NAME}-alb"

ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names "${APP_NAME}-alb" \
  --region "$REGION" \
  --query "LoadBalancers[0].LoadBalancerArn" \
  --output text 2>/dev/null || echo "")

if [[ -z "$ALB_ARN" || "$ALB_ARN" == "None" ]]; then
  echo "ERROR: ALB '${APP_NAME}-alb' not found in ${REGION}."
  echo "       Run scripts/setup-aws.sh first."
  exit 1
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --region "$REGION" \
  --query "LoadBalancers[0].DNSName" --output text)

TG_ARN=$(aws elbv2 describe-target-groups \
  --names "${APP_NAME}-tg" \
  --region "$REGION" \
  --query "TargetGroups[0].TargetGroupArn" --output text)

ok "ALB DNS: ${ALB_DNS}"

# ── 2. ACM certificate ─────────────────────────────────────────────────────────
step "ACM certificate for: ${DOMAIN}"

# Check if a valid cert already exists for this exact domain
CERT_ARN=$(aws acm list-certificates \
  --region "$REGION" \
  --query "CertificateSummaryList[?DomainName=='${DOMAIN}'].CertificateArn" \
  --output text 2>/dev/null | head -1 || echo "")

if [[ -n "$CERT_ARN" && "$CERT_ARN" != "None" ]]; then
  CERT_STATUS=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$REGION" \
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
    --region "$REGION" \
    --query "CertificateArn" \
    --output text)
  ok "Requested new certificate: ${CERT_ARN}"
fi

# ── 3. DNS validation ──────────────────────────────────────────────────────────
CERT_STATUS=$(aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region "$REGION" \
  --query "Certificate.Status" \
  --output text)

if [[ "$CERT_STATUS" != "ISSUED" ]]; then
  # Give ACM a moment to generate the validation record
  sleep 3

  DNS_RECORD=$(aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region "$REGION" \
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
      --region "$REGION" \
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

# ── 4. ALB security group — ensure port 443 is open ───────────────────────────
step "ALB security group — port 443"

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query "Vpcs[0].VpcId" --output text)

ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=${APP_NAME}-alb-sg" "Name=vpc-id,Values=${VPC_ID}" \
  --region "$REGION" \
  --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")

if [[ -n "$ALB_SG" && "$ALB_SG" != "None" ]]; then
  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 \
    --region "$REGION" > /dev/null 2>&1 || true
  ok "Port 443 open on ALB SG: ${ALB_SG}"
fi

# ── 5. HTTPS listener — create or update cert ──────────────────────────────────
step "HTTPS listener (port 443)"

HTTPS_LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN" \
  --region "$REGION" \
  --query "Listeners[?Port==\`443\`].ListenerArn" \
  --output text 2>/dev/null || echo "")

if [[ -z "$HTTPS_LISTENER_ARN" || "$HTTPS_LISTENER_ARN" == "None" ]]; then
  HTTPS_LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS --port 443 \
    --certificates "CertificateArn=${CERT_ARN}" \
    --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
    --region "$REGION" \
    --query "Listeners[0].ListenerArn" --output text)
  ok "Created HTTPS listener"
else
  # Swap in the new cert on the existing listener
  aws elbv2 modify-listener \
    --listener-arn "$HTTPS_LISTENER_ARN" \
    --certificates "CertificateArn=${CERT_ARN}" \
    --region "$REGION" > /dev/null
  ok "Updated certificate on existing HTTPS listener"
fi

# ── 6. Optional HTTP → HTTPS redirect ─────────────────────────────────────────
if [[ "$REDIRECT_HTTP" == true ]]; then
  step "HTTP → HTTPS redirect (port 80)"

  HTTP_LISTENER_ARN=$(aws elbv2 describe-listeners \
    --load-balancer-arn "$ALB_ARN" \
    --region "$REGION" \
    --query "Listeners[?Port==\`80\`].ListenerArn" \
    --output text 2>/dev/null || echo "")

  if [[ -n "$HTTP_LISTENER_ARN" && "$HTTP_LISTENER_ARN" != "None" ]]; then
    aws elbv2 modify-listener \
      --listener-arn "$HTTP_LISTENER_ARN" \
      --default-actions "Type=redirect,RedirectConfig={Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
      --region "$REGION" > /dev/null
    ok "HTTP port 80 now redirects → HTTPS 443"
  else
    warn "No HTTP listener found on port 80 — skipping redirect"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  HTTPS setup complete!"
echo ""
echo "  URL:         https://${DOMAIN}"
echo "  Certificate: ${CERT_ARN}"
echo ""
echo "  ── Ensure your DNS has a CNAME pointing to the ALB ──────────"
echo "  ${DOMAIN}  →  ${ALB_DNS}"
echo "  (Cloudflare: orange cloud ON for automatic SSL termination)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
