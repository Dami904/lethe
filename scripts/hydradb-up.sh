#!/usr/bin/env bash
# Creates the host-mounted cache dir and a dev auth token, then starts MinIO
# (+ its one-shot bucket-init) and HydraDB via docker compose. Safe to re-run.
#
# HydraDB runs against MinIO here, not CLOUD_PROVIDER=local -- confirmed live
# in this project that the local/LocalFileSystem backend cannot sustain
# writes (its manifest update needs a conditional put that LocalFileSystem
# doesn't implement; every write eventually starts failing and a container
# restart does not recover it). This is a filed upstream bug,
# https://github.com/hydra-db/hydradb/issues/81, whose own suggested fix is
# exactly this: point CLOUD_PROVIDER at an S3-compatible backend. See
# docs/LIMITATIONS.md for the full account.
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p .hydradb-data/cache
if [ ! -f .hydradb-data/auth-token ]; then
  printf '%s\n' 'local-development-token-32-bytes' > .hydradb-data/auth-token
fi

# The container must run as the host user that owns .hydradb-data, or every
# write query fails with a permission error the /readyz health check won't
# catch (it only checks the listener, not that writes actually succeed).
export DOCKER_UID="$(id -u)"
export DOCKER_GID="$(id -g)"

docker compose up -d minio minio-init hydradb

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
