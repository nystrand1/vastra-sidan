#!/usr/bin/env bash
# Runs on the EC2 box. Unpacks a release tarball built by .github/workflows/deploy.yml
# (or deploy/build-local.sh), points /srv/$APP/current at it and restarts the app.
# If the new release doesn't answer, it switches back to the previous one.
#
# Runs as the deploy user, which owns the releases and may only
# `sudo systemctl restart` vss-event and vss-staging. Both apps run as vss-event.
#
# Usage: [APP=vss-staging] release.sh <tarball> <release-id> [env-file]
#   APP        vss-event (production, the default) or vss-staging
#   [env-file] replaces /srv/$APP/shared/.env. GitHub Actions builds it from
#              the repo's secrets and variables.
set -euo pipefail

TARBALL=$1
RELEASE_ID=$2
ENV_FILE=${3:-}
APP=${APP:-vss-event}
case $APP in
  vss-event) PORT=3000 ;;
  vss-staging) PORT=3001 ;;
  *) echo "Unknown APP: $APP" >&2; exit 1 ;;
esac
ROOT=/srv/$APP
RELEASE_DIR=$ROOT/releases/$RELEASE_ID
KEEP_RELEASES=5

rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$TARBALL" -C "$RELEASE_DIR"
# build-local.sh uploads as another user, whose file we can't delete from /tmp
rm -f "$TARBALL" 2>/dev/null || true

# ISR pages and optimised images survive deploys
rm -rf "$RELEASE_DIR/.next/cache"
ln -s "$ROOT/shared/cache" "$RELEASE_DIR/.next/cache"
# Regenerated ISR pages. Per release, since they belong to this build
mkdir -p "$RELEASE_DIR/.next/server/route-cache"
chgrp -R vss-event "$RELEASE_DIR/.next/server/route-cache"
chmod 2775 "$RELEASE_DIR/.next/server/route-cache"

if [ -n "$ENV_FILE" ]; then
  install -m 640 -g vss-event "$ENV_FILE" "$ROOT/shared/.env"
  rm -f "$ENV_FILE"
fi

PREVIOUS=$(readlink -f "$ROOT/current" || true)
ln -sfn "$RELEASE_DIR" "$ROOT/current"
sudo -n systemctl restart "$APP"

healthy=false
for _ in $(seq 1 30); do
  # The start page is static, so also ask for something that reads the database
  if curl -fs -o /dev/null --max-time 5 http://127.0.0.1:$PORT/ &&
    curl -fs -o /dev/null --max-time 5 http://127.0.0.1:$PORT/api/trpc/public.getAwayGames; then
    healthy=true
    break
  fi
  sleep 2
done

if [ "$healthy" != true ]; then
  echo "Release $RELEASE_ID did not come up" >&2
  journalctl -u "$APP" -n 50 --no-pager >&2 || true
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    echo "Rolling back to $PREVIOUS" >&2
    ln -sfn "$PREVIOUS" "$ROOT/current"
    sudo -n systemctl restart "$APP"
  fi
  exit 1
fi

echo "Release $RELEASE_ID is live on $APP"

# Prune old releases, never the live one
cd "$ROOT/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  [ "$ROOT/releases/$old" = "$(readlink -f "$ROOT/current")" ] || rm -rf "$old"
done
