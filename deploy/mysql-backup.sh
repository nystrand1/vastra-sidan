#!/usr/bin/env bash
# Runs on the EC2 box as root, from mysql-backup.timer. Dumps every database to
# /var/backups/mysql/<database>-<date>.sql.gz and deletes dumps older than KEEP_DAYS.
#
# Logs in through MySQL's root socket auth, so no password is stored. The daily
# EBS snapshot (03:00 UTC) carries the night's dumps off the disk.
set -euo pipefail

DIR=/var/backups/mysql
KEEP_DAYS=30
DATE=$(date -u +%Y-%m-%d)

umask 077
mkdir -p "$DIR"

databases=$(mysql -N -e "SELECT schema_name FROM information_schema.schemata
  WHERE schema_name NOT IN ('mysql', 'sys', 'information_schema', 'performance_schema')
  AND schema_name NOT LIKE 'prisma\_migrate\_shadow\_db\_%'")

for db in $databases; do
  out="$DIR/$db-$DATE.sql.gz"
  # --single-transaction reads a consistent snapshot without locking InnoDB tables.
  # No --databases, so the dump has no CREATE DATABASE/USE and a restore must name
  # its target: zcat <dump> | mysql <database>
  mysqldump --single-transaction --quick --routines --triggers --events \
    "$db" | gzip > "$out.partial"
  mv "$out.partial" "$out"
  echo "$db: $(du -h "$out" | cut -f1)"
done

find "$DIR" -name '*.sql.gz' -mtime +"$KEEP_DAYS" -print -delete
find "$DIR" -name '*.partial' -delete
