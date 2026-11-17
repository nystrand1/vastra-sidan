# Plan: lock MySQL down so Vercel can only reach `vss_dev`

Status: **not started**. Written 2026-11-17, right after production moved to EC2. Re-check the
"Today" facts before acting; they come from that day.

## Goal

- Vercel (preview deployments, `staging.event.vastrasidan.se`, and `vercel env pull` for local
  development) can log in to MySQL over the internet, but only to `vss_dev`.
- Nothing else can log in over the internet. The production databases (`vss_prod`,
  `vss_wordpress_prod`) are only reachable from the box itself.
- You can still reach **both** `vss_dev` and `vss_prod` from your machine, through an SSH tunnel.

## Today

MySQL 8.0 on the box listens on `0.0.0.0:3306` and `0.0.0.0:33060` (X protocol, unused). `ufw`
is off, so the AWS security group is the only filter. Accounts:

| Account | Can log in from | Databases |
| --- | --- | --- |
| `vss@'%'` | anywhere | `vss_prod`, `vss_dev`, `vss_wordpress_prod`, `vss_wordpress_dev`, `oldforum`, plus `CREATE` on `*.*` |
| `vss@localhost` | the box | `vss_prod`, `vss_dev`, `vss_wordpress_prod`, `vss_wordpress_dev` |
| `oldforum@'%'` | anywhere | `oldforum` |
| `root@localhost` | the box, socket auth | everything |

Who connects, and as which account:

| Client | Path | Account | Database |
| --- | --- | --- | --- |
| The site (`vss-event.service`) | `127.0.0.1` | `vss@localhost` | `vss_prod` |
| WordPress prod (`api.`) | `localhost` | `vss@localhost` | `vss_wordpress_prod` |
| WordPress dev (`cmsdev.`) | `127.0.0.1` | `vss@localhost` | `vss_wordpress_dev` |
| GitHub Actions build | SSH tunnel as `deploy` → `127.0.0.1` | `vss@localhost` | `vss_prod` |
| Nightly dump (`mysql-backup.timer`) | socket | `root@localhost` | all |
| Vercel Preview + Development (`DATABASE_URL`) | internet | `vss@'%'` | `vss_dev` |
| Vercel's old production deployment | internet | `vss@'%'` | `vss_prod`, still serving visitors whose DNS hadn't updated yet |
| Your machine (repo `.env`) | internet, `ec2-13-49-38-231.eu-north-1.compute.amazonaws.com` | `vss@'%'` | **`vss_prod`** |
| Old forum | not checked | probably `oldforum@'%'` from the box | `oldforum` |

Clients on `127.0.0.1` match `vss@localhost` because `skip_name_resolve` is off, so MySQL turns
`127.0.0.1` into `localhost`. `information_schema.processlist` shows them as `localhost`.

`vss@localhost` and `vss@'%'` have the same password: the box's app logs in as
`vss@localhost` with the password from Vercel's production `DATABASE_URL`, which Vercel uses as
`vss@'%'`.

The public port is being probed. `performance_schema.accounts` (counts since MySQL started on
2026-11-13) showed 47 remote attempts as `root` from 11 hosts, and attempts as `admin` and `sa`.

## Target

| Client | Path | Account | Databases |
| --- | --- | --- | --- |
| Vercel Preview + Development | internet | **`vss_preview@'%'`** (new) | `vss_dev` only |
| The site, WordPress, GitHub Actions, your machine | `127.0.0.1` (your machine via SSH tunnel) | `vss@localhost` | as today |
| Backups | socket | `root@localhost` | all |

`vss@'%'` is gone. `oldforum@'%'` is moved to `localhost` or dropped. Port 33060 is closed.
Port 3306 stays open to the internet, because Vercel has no fixed IP addresses to allow, but
the only account that can log in through it only has `vss_dev`.

## Before starting

1. **Vercel no longer serves production.** `vercel.json` with `deploymentEnabled.main = false`
   is on `main`, and `www` and the apex point at the box in Loopia. On the box, this returns
   nothing, checked a few times over at least a day:
   ```bash
   ssh VastraAWS 'sudo mysql -e "SELECT host, COUNT(*) FROM information_schema.processlist WHERE user = \"vss\" AND db = \"vss_prod\" AND host NOT LIKE \"localhost%\" GROUP BY host"'
   ```
2. **Re-check the inventory.** Accounts and grants may have changed:
   ```bash
   ssh VastraAWS 'sudo mysql -e "SELECT user, host FROM mysql.user; SHOW GRANTS FOR \"vss\"@\"%\"; SHOW GRANTS FOR \"vss\"@\"localhost\""'
   ```
3. Find out who else connects with `vss@'%'` from their own machine (other developers, a
   database GUI), and move them to the tunnel in step 1 below.

## Steps

### 1. Move your machine to the SSH tunnel (do this first)

Dropping `vss@'%'` locks out anything that still connects over the public hostname, including
your current `.env`.

```bash
ssh -N -L 3307:127.0.0.1:3306 VastraAWS
```

Then, with the same `vss` password you use today:

```
DATABASE_URL="mysql://vss:<password>@127.0.0.1:3307/vss_dev"   # day-to-day
DATABASE_URL="mysql://vss:<password>@127.0.0.1:3307/vss_prod"  # only when you mean to touch production
```

Point `.env` at `vss_dev` by default. Today it points at `vss_prod`, so a stray `prisma db push`
or test run against it changes production. To open the tunnel on every `ssh VastraAWS`, add
`LocalForward 3307 127.0.0.1:3306` to that host in `~/.ssh/config`.

Check: `pnpm dev` works, and Prisma Studio opens both databases through `127.0.0.1:3307`.

`prisma migrate dev` creates a shadow database, which needs `CREATE` on `*.*` and only
`vss@'%'` has that today. Run `migrate dev` against the local Docker MariaDB
(`docker-compose.yaml`) instead of the box. Five empty leftovers from earlier runs exist on the
box (`prisma_migrate_shadow_db_*`); drop them in step 5.

### 2. Create the preview account

On the box. Generate the password there so it never appears in a command line or shell
history. Hex keeps it safe to put in a URL.

```bash
ssh VastraAWS 'sudo sh -c "umask 077; openssl rand -hex 24 > /root/vss_preview.password"'
```

Then, as root on the box (`sudo mysql`), with the password read from that file:

```sql
CREATE USER 'vss_preview'@'%' IDENTIFIED BY '<contents of /root/vss_preview.password>';
GRANT ALL PRIVILEGES ON `vss_dev`.* TO 'vss_preview'@'%';
```

`ALL` on `vss_dev` covers what previews and `prisma db push` against `vss_dev` need. Builds on
Vercel don't touch the schema: `build` is `next build`, and `postinstall` only runs
`prisma generate`.

Check: through the tunnel, `vss_preview` can't see `vss_prod`.
`SHOW DATABASES` as `vss_preview` lists only `vss_dev` and `information_schema`.

### 3. Point Vercel's Preview and Development `DATABASE_URL` at it

Vercel project `vastra-sidan` has one `DATABASE_URL` for both Preview and Development. Change
only the user and password, keeping the host, database (`vss_dev`) and any query parameters:

```
mysql://vss_preview:<password>@ec2-13-49-38-231.eu-north-1.compute.amazonaws.com:3306/vss_dev
```

Use the dashboard (Settings → Environment Variables), or the CLI with the value on stdin
(`vercel env rm DATABASE_URL preview` and `development`, then `vercel env add` for each). Mark it
**Sensitive**. Today it is "Non-sensitive". Keep the old value until the checks pass.

Redeploy the `staging` branch. Check:
- `https://staging.event.vastrasidan.se/bortaresor` lists trips, and a test-mode booking goes
  through.
- `processlist` on the box shows `vss_preview` from `ec2-*.eu-north-1.compute.amazonaws.com`
  hosts on `vss_dev`, and no remote `vss` connections.

### 4. Wait a day, then confirm nobody logs in remotely as `vss`

Snapshot the remote `vss` logins, then compare a day later. The number must not grow:

```sql
SELECT SUM(total_connections) FROM performance_schema.accounts
WHERE user = 'vss' AND host NOT IN ('localhost', '127.0.0.1');
```

If it grows, find the host (`SELECT host, total_connections FROM performance_schema.accounts
WHERE user = 'vss' ...`) and move that client first.

### 5. Remove the broad accounts

Save them first, so a rollback restores the same password and grants. `SHOW CREATE USER`
includes the password hash.

On the box (`ssh VastraAWS`):

```bash
sudo sh -c 'umask 077; mysql -N > /root/mysql-accounts-before-lockdown.sql' <<'SQL'
SHOW CREATE USER 'vss'@'%';
SHOW GRANTS FOR 'vss'@'%';
SHOW CREATE USER 'oldforum'@'%';
SHOW GRANTS FOR 'oldforum'@'%';
SQL
```

Each line in the file needs a `;` added before it can be replayed.

Then:

```sql
DROP USER 'vss'@'%';
```

`oldforum@'%'`: find what the old forum (`/var/www/old_forum`, `forum.vastrasidan.se`) connects
with. If it's this account from the box, keep the password and grants and only change where it
may log in from:

```sql
RENAME USER 'oldforum'@'%' TO 'oldforum'@'localhost';
```

If the forum is only an archive and doesn't need the database, drop the account instead, after
asking.

Drop the empty Prisma shadow databases, after checking they're still empty:

```sql
SELECT table_schema, COUNT(*) FROM information_schema.tables
WHERE table_schema LIKE 'prisma\_migrate\_shadow\_db\_%' GROUP BY table_schema;
-- then DROP DATABASE `prisma_migrate_shadow_db_<uuid>`; for each
```

Check: the site, `api.vastrasidan.se/graphql`, `cmsdev.`, `forum.`, `staging.event` and the
tunnel all still work, and `vss_preview` is the only account with a host other than localhost:
`SELECT user, host FROM mysql.user WHERE host NOT IN ('localhost', '127.0.0.1');`

### 6. Close the X protocol port (33060)

Nothing uses it. In `/etc/mysql/mysql.conf.d/mysqld.cnf`, under `[mysqld]`, replace
`mysqlx-bind-address = 0.0.0.0` with `mysqlx = OFF`. That needs a MySQL restart. The site and
WordPress are down for a few seconds, so pick a quiet time:

```bash
ssh VastraAWS 'sudo systemctl restart mysql && sudo ss -ltn | grep -E ":3306|:33060"'
```

Check: only `:3306` is listening, and the site and WordPress answer. The site's connection
pool reconnects by itself; if it doesn't, `sudo systemctl restart vss-event`. In the AWS
security group, remove any rule for 33060.

### 7. Optional: require TLS for `vss_preview`

MySQL already has TLS (`have_ssl = YES`, with a self-signed certificate). Today the preview
password crosses the internet unencrypted. To require TLS:

```sql
ALTER USER 'vss_preview'@'%' REQUIRE SSL;
```

Only do this after a preview deployment connects with TLS. `src/server/db.ts` passes the URL to
`@prisma/adapter-mariadb`, so the TLS options go in `DATABASE_URL`'s query string. With a
self-signed certificate the client must not verify the CA. Check which query parameter the
mariadb connector reads for that, test it on a preview, then set `REQUIRE SSL`.

### 8. Clean up Vercel and the docs

- Once the domains are removed from the Vercel project, delete Vercel's **Production**
  `DATABASE_URL` and the other production secrets there (Stripe, NextAuth, AWS, `CRON_KEY`).
  Production config lives in GitHub's `Production` environment now.
- `deploy/README.md`: in "Reaching MySQL from your machine", show both `vss_dev` and
  `vss_prod` through the tunnel, and that the public port only takes `vss_preview`. Replace the
  closing note about previews and the public port with the new setup. Add `vss_preview` to the
  Configuration section.
- Delete this plan, or mark it done.

## Rollback

| Step | Undo |
| --- | --- |
| 3 | Put the old `DATABASE_URL` back for Preview and Development, and redeploy `staging` |
| 5 | Replay the saved `/root/mysql-accounts-before-lockdown.sql` (the `CREATE USER ... IDENTIFIED WITH ... AS '<hash>'` and the `GRANT` lines) with `sudo mysql`. `RENAME USER 'oldforum'@'localhost' TO 'oldforum'@'%'` |
| 6 | Put `mysqlx-bind-address = 0.0.0.0` back and restart MySQL |
| 7 | `ALTER USER 'vss_preview'@'%' REQUIRE NONE;` |

## Out of scope

- Moving `vss_dev` off the production box, or giving previews their own database server.
- Rotating the `vss` password. `vss@localhost` and `vss@'%'` share it, and it has been in
  Vercel's production env. Rotating it means updating the `DATABASE_URL` secret on GitHub,
  `/srv/vss-event/shared/.env` (the next deploy does that), both `wp-config.php` files and your
  `.env`. Worth doing after this, as its own change.
