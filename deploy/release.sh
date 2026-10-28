#!/usr/bin/env bash
# Runs on the EC2 box. Unpacks a release tarball built by .github/workflows/deploy.yml
# (or deploy/build-local.sh), points /srv/vss-event/current at it and restarts the app.
# If the new release doesn't answer, it switches back to the previous one.
#
# Usage: release.sh <tarball> <release-id> [env-file]
#   [env-file] replaces /srv/vss-event/shared/.env. GitHub Actions builds it from
#              the repo's secrets and variables.
set -euo pipefail

TARBALL=$1
RELEASE_ID=$2
ENV_FILE=${3:-}
ROOT=/srv/vss-event
RELEASE_DIR=$ROOT/releases/$RELEASE_ID
KEEP_RELEASES=5

mkdir -p "$ROOT/releases" "$ROOT/shared/cache"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$TARBALL" -C "$RELEASE_DIR"
rm -f "$TARBALL"

# ISR pages and optimised images survive deploys
rm -rf "$RELEASE_DIR/.next/cache"
ln -s "$ROOT/shared/cache" "$RELEASE_DIR/.next/cache"

if [ -n "$ENV_FILE" ]; then
  install -m 600 "$ENV_FILE" "$ROOT/shared/.env"
  rm -f "$ENV_FILE"
fi

PREVIOUS=$(readlink -f "$ROOT/current" || true)
ln -sfn "$RELEASE_DIR" "$ROOT/current"
sudo systemctl restart vss-event

healthy=false
for _ in $(seq 1 30); do
  # The start page is static, so also ask for something that reads the database
  if curl -fs -o /dev/null --max-time 5 http://127.0.0.1:3000/ &&
    curl -fs -o /dev/null --max-time 5 http://127.0.0.1:3000/api/trpc/public.getAwayGames; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "Release $RELEASE_ID did not come up" >&2
  sudo journalctl -u vss-event -n 50 --no-pager >&2 || true
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    echo "Rolling back to $PREVIOUS" >&2
    ln -sfn "$PREVIOUS" "$ROOT/current"
    sudo systemctl restart vss-event
  fi
  exit 1
fi

echo "Release $RELEASE_ID is live"

# Prune old releases, never the live one
cd "$ROOT/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [ "$ROOT/releases/$old" = "$(readlink -f "$ROOT/current")" ] || rm -rf "$old"
done
