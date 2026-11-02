#!/usr/bin/env bash
# Packs the output of `next build` (output: "standalone") into a tarball that
# deploy/release.sh can unpack. Run from the repo root after `pnpm build`.
#
# Usage: deploy/package.sh <out.tar.gz>
set -euo pipefail

OUT=$1
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -a .next/standalone/. "$STAGE/"
# The standalone server doesn't include static assets or public/
mkdir -p "$STAGE/.next"
cp -a .next/static "$STAGE/.next/static"
cp -a public "$STAGE/public"
# Never ship env files; the server reads /srv/vss-event/shared/.env
rm -f "$STAGE"/.env "$STAGE"/.env.*

tar -czf "$OUT" -C "$STAGE" .
echo "Packed $(du -h "$OUT" | cut -f1) into $OUT"
