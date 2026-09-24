#!/usr/bin/env node
/**
 * Fetches a secret from AWS Secrets Manager (no external npm deps — Node 24 built-ins only).
 * Prints each JSON key as a shell export statement so the caller can eval the output.
 *
 * Required env vars:
 *   AWS_SECRET_ID        Secret name or ARN
 *   AWS_DEFAULT_REGION   AWS region (or AWS_REGION)
 *
 * Credential chain (first match wins):
 *   1. AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY [+ AWS_SESSION_TOKEN]
 *   2. ECS task role   — AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
 *   3. EKS / IRSA      — AWS_CONTAINER_CREDENTIALS_FULL_URI
 *   4. EC2 IMDSv2      — http://169.254.169.254
 */

import { createHmac, createHash } from 'node:crypto';

const region = process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION;
const secretId = process.env.AWS_SECRET_ID;

if (!secretId) {
  process.stderr.write('AWS_SECRET_ID is not set\n');
  process.exit(1);
}
if (!region) {
  process.stderr.write('AWS_DEFAULT_REGION or AWS_REGION is not set\n');
  process.exit(1);
}

// ─── SigV4 helpers ────────────────────────────────────────────────────────────

const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

function signingKey(secret, date, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), service), 'aws4_request');
}

function buildHeaders({ host, body, accessKeyId, secretAccessKey, sessionToken }) {
  const now = new Date();
  const amzDate =
    now
      .toISOString()
      .replace(/[:\-]|\.\d{3}/g, '')
      .slice(0, 15) + 'Z';
  const datestamp = amzDate.slice(0, 8);

  const headers = {
    'content-type': 'application/x-amz-json-1.1',
    host: host,
    'x-amz-date': amzDate,
    'x-amz-target': 'secretsmanager.GetSecretValue',
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
  };

  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');

  const canonical = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256hex(body)].join('\n');

  const credScope = `${datestamp}/${region}/secretsmanager/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credScope, sha256hex(canonical)].join('\n');
  const sig = hmac(
    signingKey(secretAccessKey, datestamp, region, 'secretsmanager'),
    stringToSign,
  ).toString('hex');

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

// ─── Credential resolution ────────────────────────────────────────────────────

async function resolveCredentials() {
  // 1. Explicit env vars
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    };
  }

  // 2. ECS task role
  if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
    const res = await fetch(
      `http://169.254.170.2${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`,
    );
    const d = await res.json();
    return {
      accessKeyId: d.AccessKeyId,
      secretAccessKey: d.SecretAccessKey,
      sessionToken: d.Token,
    };
  }

  // 3. EKS / IRSA
  if (process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
    const authToken = process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
    const res = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {
      headers: authToken ? { authorization: authToken } : {},
    });
    const d = await res.json();
    return {
      accessKeyId: d.AccessKeyId,
      secretAccessKey: d.SecretAccessKey,
      sessionToken: d.Token,
    };
  }

  // 4. EC2 IMDSv2
  try {
    const tokenRes = await fetch('http://169.254.169.254/latest/api/token', {
      method: 'PUT',
      headers: { 'x-aws-ec2-metadata-token-ttl-seconds': '21600' },
    });
    const token = await tokenRes.text();
    const roleRes = await fetch(
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      {
        headers: { 'x-aws-ec2-metadata-token': token },
      },
    );
    const role = (await roleRes.text()).trim();
    const credsRes = await fetch(
      `http://169.254.169.254/latest/meta-data/iam/security-credentials/${role}`,
      {
        headers: { 'x-aws-ec2-metadata-token': token },
      },
    );
    const d = await credsRes.json();
    return {
      accessKeyId: d.AccessKeyId,
      secretAccessKey: d.SecretAccessKey,
      sessionToken: d.Token,
    };
  } catch {
    // not on EC2
  }

  throw new Error(
    'No AWS credentials found. Provide AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or ' +
      'run on ECS/EC2/EKS with an attached IAM role.',
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const creds = await resolveCredentials();
const host = `secretsmanager.${region}.amazonaws.com`;
const body = JSON.stringify({ SecretId: secretId });

const res = await fetch(`https://${host}/`, {
  method: 'POST',
  headers: buildHeaders({ host, body, ...creds }),
  body,
});

if (!res.ok) {
  const err = await res.text();
  process.stderr.write(`Secrets Manager error (HTTP ${res.status}): ${err}\n`);
  process.exit(1);
}

const { SecretString } = await res.json();
const secret = JSON.parse(SecretString);

for (const [key, value] of Object.entries(secret)) {
  const escaped = String(value).replace(/'/g, "'\\''");
  process.stdout.write(`export ${key}='${escaped}'\n`);
}
