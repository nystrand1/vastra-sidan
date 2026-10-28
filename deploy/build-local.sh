#!/usr/bin/env bash
# Builds a linux/amd64 release in Docker (the EC2 box is too small to run `next build`)
# and deploys it. Use when GitHub Actions isn't an option.
#
# Usage: deploy/build-local.sh <env-file> [ssh-host]
#   <env-file>  the production env, used for the build (NEXT_PUBLIC_* are baked in
#               and getStaticProps reads the database and WordPress)
#   [ssh-host]  defaults to VastraAWS
set -euo pipefail

ENV_FILE=$1
HOST=${2:-VastraAWS}
RELEASE_ID=$(date -u +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD)
OUT=/tmp/vss-event-$RELEASE_ID.tar.gz

docker run --rm --platform linux/amd64 \
  -v "$PWD":/src:ro \
  -v "$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")":/env:ro \
  -v /tmp:/out \
  node:24-bookworm bash -euc "
    corepack enable
    mkdir /app && cd /app
    tar -C /src --exclude=./node_modules --exclude=./.next --exclude=./.claude -cf - . | tar -xf -
    cp /env .env
    pnpm install --frozen-lockfile
    pnpm build
    deploy/package.sh /out/$(basename "$OUT")
  "

scp "$OUT" deploy/release.sh "$HOST":/tmp/
ssh "$HOST" "bash /tmp/release.sh /tmp/$(basename "$OUT") $RELEASE_ID"
rm -f "$OUT"
