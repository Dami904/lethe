#!/usr/bin/env bash
# Creates the host-mounted store/cache dirs and a dev auth token, then starts
# HydraDB via docker compose. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .hydradb-data/store .hydradb-data/cache
if [ ! -f .hydradb-data/auth-token ]; then
  printf '%s\n' 'local-development-token-32-bytes' > .hydradb-data/auth-token
fi

docker compose up -d hydradb

echo "Waiting for HydraDB readiness on :9090/readyz ..."
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:9090/readyz > /dev/null 2>&1; then
    echo "HydraDB is ready."
    exit 0
  fi
  sleep 1
done

echo "HydraDB did not become ready in time; check 'docker compose logs hydradb'." >&2
exit 1
