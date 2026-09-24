#!/bin/sh
set -e

# If AWS_SECRET_ID is set, fetch the secret from AWS Secrets Manager and
# inject every JSON key as an environment variable before starting the app.
if [ -n "${AWS_SECRET_ID}" ]; then
  echo "[entrypoint] Fetching secrets for: ${AWS_SECRET_ID}"

  exports=$(node /app/scripts/fetch-aws-secrets.mjs)
  # shellcheck disable=SC2181
  if [ $? -ne 0 ]; then
    echo "[entrypoint] ERROR: failed to fetch secrets from AWS Secrets Manager" >&2
    exit 1
  fi

  eval "$exports"
  echo "[entrypoint] Secrets injected"
fi

echo "[entrypoint] Running database migrations..."
node /app/dist/db/migrate.js
echo "[entrypoint] Migrations complete"

exec "$@"
