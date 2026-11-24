# Deploying to EC2

Production and staging run as Next.js standalone servers on the same EC2 box as MySQL and
WordPress (`ssh VastraAWS`, t3.small, Ubuntu 22.04). Apache terminates TLS and proxies to them.
Vercel only builds previews of the other branches.

```
Internet → Apache :443 (certbot) → node server.js on 127.0.0.1:3000 (production)
                                                    127.0.0.1:3001 (staging)   → MySQL on localhost
```

| Branch        | Built by                       | GitHub environment | Runs on                                       | Database   |
| ------------- | ------------------------------ | ------------------ | --------------------------------------------- | ---------- |
| `main`        | `.github/workflows/deploy.yml` | `Production`       | EC2, `vss-event`, `www.vastrasidan.se`        | `vss_prod` |
| `staging`     | `.github/workflows/deploy.yml` | `Staging`          | EC2, `vss-staging`, `staging.event.vastrasidan.se` | `vss_dev` |
| anything else | Vercel                         |                    | Vercel previews (`*.vercel.app`)              | `vss_dev`  |

`vercel.json` turns off Vercel's builds of `main` and `staging`, so a `staging` → `main` PR
gets no Vercel preview. Staging is that preview.

The box has 2 GB of RAM, so it never builds. GitHub Actions builds a linux/amd64 release and the
box only unpacks and runs it.

## Users on the box

| User        | What it can do                                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `deploy`    | Logs in with the GitHub Actions keys (one per environment). Owns the releases. Its only sudo rights are `systemctl restart vss-event` and `systemctl restart vss-staging`, and its only port forward is to MySQL on `127.0.0.1:3306` |
| `vss-event` | Runs both apps (no login). Can write only `shared/cache` and each release's `.next/server/route-cache`. systemd also keeps it off `/home` and makes the rest of the system read-only |
| `ubuntu`    | Your login, with full sudo. Not used by deploys                                |

## Layout on the box

| Path                          | What                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `/srv/vss-event/releases/*`   | One unpacked release per deploy, the newest 5 are kept       |
| `/srv/vss-event/current`      | Symlink to the live release                                  |
| `/srv/vss-event/shared/.env`  | Production env (`deploy:vss-event`, mode 640), rewritten by every deploy |
| `/srv/vss-event/shared/cache` | `.next/cache` (ISR pages, optimised images), kept across deploys |
| `/etc/systemd/system/vss-event.service` | From `deploy/vss-event.service`                    |
| `/srv/vss-staging/...`        | The same layout for staging, run by `vss-staging.service` (from `deploy/vss-staging.service`) |
| `/var/backups/mysql/*.sql.gz` | Nightly database dumps (root only), the last 30 days         |

## Configuration

Everything lives in the repo's **`Production` environment** on GitHub
(Settings → Environments → Production). The workflow writes it to `.env`, builds with it
(`NEXT_PUBLIC_*` are baked into the client) and installs the same file on the box. To change
a value: edit it on GitHub and re-run the workflow.

**Secrets**

| Name                    | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| `DATABASE_URL`          | `mysql://vss:…@127.0.0.1:3306/vss_prod`. The build reaches it through an SSH tunnel |
| `NEXTAUTH_SECRET`       |                                                         |
| `WORDPRESS_API_KEY`     |                                                         |
| `CRON_KEY`              | Must match the key in WordPress (`themes/storefront/inc/vss-functions.php`) |
| `STRIPE_API_KEY`        | Live secret key                                         |
| `STRIPE_WEBHOOK_SECRET` | From the production webhook endpoint in Stripe          |
| `AWS_CLIENT_ID`, `AWS_CLIENT_SECRET` | SES                                        |
| `SENTRY_AUTH_TOKEN`     | Source map upload                                       |
| `EC2_SSH_KEY`           | Private half of the `github-actions-deploy@nystrand1/vss-event` key in `~deploy/.ssh/authorized_keys` |

**Variables**

| Name                         | Value                                    |
| ---------------------------- | ---------------------------------------- |
| `EC2_HOST`                   | The box's Elastic IP                     |
| `EC2_KNOWN_HOSTS`            | Output of `ssh-keyscan <EC2_HOST>`       |
| `NEXTAUTH_URL`, `WEBSITE_URL`, `NEXT_PUBLIC_WEBSITE_URL` | `https://www.vastrasidan.se` |
| `NEXT_PUBLIC_WORDPRESS_URL`  | `https://api.vastrasidan.se`             |
| `NEXT_PUBLIC_STRIPE_API_KEY` | Live publishable key                     |
| `NEXT_PUBLIC_ENABLE_MEMBERSHIPS`, `NEXT_PUBLIC_ENABLE_LOGIN`, `NEXT_PUBLIC_ENABLE_AWAYGAMES`, `NEXT_PUBLIC_ENABLE_ANALYTICS`, `ENABLE_AWS_SES_EMAILS`, `USE_DEV_MODE` | `true`/`false`, leave unset for the default |
| `CANCELLATION_URL`, `MEMBERSHIP_URL`, `API_URL`, `BOOKING_EMAIL` | As in Vercel        |
| `SENTRY_PROJECT_NAME`        | As in Vercel                             |

The **`Staging`** environment has the same names, with Stripe test keys, `vss_dev` in
`DATABASE_URL`, `https://staging.event.vastrasidan.se` for the URLs, and its own `EC2_SSH_KEY`
(`github-actions-deploy-staging@…` in `authorized_keys`). It only deploys from `staging`. It
has no `SENTRY_AUTH_TOKEN`, so staging builds upload no source maps.

Vercel set `VERCEL_URL` and the code fell back to it. Nothing does that on EC2, so the URLs
above must be set.

A new env var needs three changes: `src/env.mjs`, the `ENV_NAMES` list in `deploy.yml`, and
a secret or variable in both GitHub environments.

## Deploying

Push to `main` (production) or `staging`, or run the "Deploy to EC2" workflow by hand on one
of them. `deploy/release.sh` swaps the `current` symlink, restarts the service and checks that
`/` and a database query answer. If they don't, it switches back to the previous release.

Without GitHub: `deploy/build-local.sh path/to/production.env` builds in Docker on your machine
and deploys. `APP=vss-staging deploy/build-local.sh path/to/staging.env` does the same for
staging.

**Rollback by hand** (keeps the current `.env`):

```bash
ssh VastraAWS 'ls -1t /srv/vss-event/releases'
ssh VastraAWS 'sudo -u deploy ln -sfn /srv/vss-event/releases/<id> /srv/vss-event/current && sudo systemctl restart vss-event'
```

## Operating

```bash
ssh VastraAWS 'sudo systemctl status vss-event'
ssh VastraAWS 'sudo journalctl -u vss-event -f'
```

Use `vss-staging` for staging. Staging has a smaller memory cap (500 MB, 256 MB heap) and a
higher OOM score than production, so on a short box it is killed first.

Cron jobs are WP-Cron events in WordPress (`themes/storefront/inc/vss-functions.php`). They
POST to `https://www.vastrasidan.se/api/trpc/cron.*`, which is this box.

## Backups

| What                  | When           | Kept    | Covers                                             |
| --------------------- | -------------- | ------- | -------------------------------------------------- |
| `mysql-backup.timer`  | 02:00 UTC      | 30 days | Every database, as `/var/backups/mysql/<database>-<date>.sql.gz` |
| EBS snapshot (Data Lifecycle Manager, instances tagged `Backup=daily`) | 03:00 UTC | 14 days | The whole disk, including that night's dumps |

The dump job is `deploy/mysql-backup.sh` with `deploy/mysql-backup.{service,timer}`. To install
or update it:

```bash
scp deploy/mysql-backup.sh deploy/mysql-backup.service deploy/mysql-backup.timer VastraAWS:/tmp/
ssh VastraAWS 'sudo install -m 755 /tmp/mysql-backup.sh /usr/local/sbin/mysql-backup && sudo install -m 644 /tmp/mysql-backup.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now mysql-backup.timer'
```

Check the last run with `ssh VastraAWS 'systemctl status mysql-backup.service'`.

**Restoring.** A dump has no `CREATE DATABASE` or `USE`, so you always choose where it goes.
Restore into a new database first and copy what you need from there:

```bash
ssh VastraAWS 'sudo mysql -e "CREATE DATABASE restore_vss_prod" && sudo zcat /var/backups/mysql/vss_prod-<date>.sql.gz | sudo mysql restore_vss_prod'
```

Only restore over a live database (`... | sudo mysql vss_prod`) when replacing all of it, with
`vss-event` stopped.

## Reaching MySQL from your machine

Tunnel over SSH instead of connecting to the public port:

```bash
ssh -N -L 3307:127.0.0.1:3306 VastraAWS
```

Then use `DATABASE_URL="mysql://vss:…@127.0.0.1:3307/vss_dev"` (3307, because the local
Docker MariaDB has 3306). Prisma Studio, `prisma db push` and TablePlus all work through it. To
open it with every `ssh VastraAWS`, add `LocalForward 3307 127.0.0.1:3306` to that host in
`~/.ssh/config`.

## Cutover checklist

DNS for `vastrasidan.se` lives in Loopia, the registrar, and is edited in its DNS editor
(`ns1/ns2.loopia.se` only, since 2026-11-17). Loopia's zone has a wildcard to its parking
page, so a name without a record shows that page instead of failing.

**Before the day**

1. The `Production` environment on GitHub is filled in, with `NEXTAUTH_URL` set to
   `https://www.vastrasidan.se`, and `main` deploys to the box. The app runs, but nothing
   routes to it yet.
2. Install the vhost: copy `deploy/apache-vss-event.conf` to `/etc/apache2/sites-available/vss-event.conf`,
   `sudo a2ensite vss-event && sudo apache2ctl configtest && sudo systemctl reload apache2`.
3. In Stripe, the production webhook endpoint is on `https://www.vastrasidan.se`. The apex
   only redirects, and Stripe doesn't follow redirects.
4. In Loopia, set the TTL of `@` and `www` to 300 at least an hour ahead, so the switch and a
   rollback take minutes.
5. Get the certificate before DNS moves, with Let's Encrypt's DNS challenge:
   ```bash
   sudo certbot certonly --manual --preferred-challenges dns --cert-name vastrasidan.se -d vastrasidan.se -d www.vastrasidan.se
   ```
   It prints a TXT value for `_acme-challenge` and one for `_acme-challenge.www`. Add both in
   Loopia (TTL 300), wait until `dig +short TXT _acme-challenge.vastrasidan.se @ns1.loopia.se`
   shows them, and press Enter. Then `sudo certbot install --apache --cert-name vastrasidan.se --redirect`
   adds the HTTPS vhost. Remove the TXT records afterwards.

**On the day**

6. Merge the PR that adds `vercel.json` (`{ "git": { "deploymentEnabled": { "main": false } } }`).
   Vercel stops deploying `main`, and its last production deployment keeps serving until DNS moves.
7. In Loopia, point `@` (A, now `76.76.21.21`) at the Elastic IP, and replace the `www` CNAME
   (`cname.vercel-dns.com`) with an A record to the Elastic IP. Leave `staging.event`, which
   is the Vercel previews.
8. Once `dig +short www.vastrasidan.se @1.1.1.1` shows the box:
   - `sudo systemctl enable vss-event`, so the app starts on boot.
   - A manual certificate doesn't renew itself. Reissue it over HTTP, which does:
     `sudo certbot --apache --cert-name vastrasidan.se -d vastrasidan.se -d www.vastrasidan.se --force-renewal`,
     then `sudo certbot renew --dry-run --cert-name vastrasidan.se`.
9. Check:
   - a booking end to end, with the webhook delivered in Stripe's dashboard
   - admin login and a confirmation email
   - `/api/trpc/cron.*` requests from WordPress in `/var/log/apache2/vss-event-access.log`

**Rollback:** in Loopia, set `@` back to A `76.76.21.21` and `www` back to CNAME
`cname.vercel-dns.com`. Vercel still serves its last production deployment as long as the
domains stay on the project.

**After a quiet week or two:**
- Remove `vastrasidan.se`, `www.vastrasidan.se` and `event.vastrasidan.se` from the Vercel
  project (Settings → Domains).
- Remove the dry-run host: `sudo a2dissite vss-event-test vss-event-test-le-ssl`,
  `sudo certbot delete --cert-name test-new-prod.vastrasidan.se`, and its A record in Loopia.

Previews on Vercel still connect to `vss_dev` over the public MySQL port, so it stays open.
Give them a user that can only touch `vss_dev`, and limit the production user to `localhost`
(see `deploy/database-lockdown-plan.md`). Staging on the box uses `127.0.0.1`, like production.

## Moving staging to the box

The box side is already done: `/srv/vss-staging`, `vss-staging.service` (enabled), the
`vss-staging` vhost (from `deploy/apache-vss-staging.conf`) and the `deploy` sudo rule.

1. Merge the PR that adds staging to `deploy.yml` and `vercel.json` into `main`.
2. Bring `staging` up to date with `main` and push it. The workflow deploys it to
   `vss-staging` and checks it on port 3001, before any DNS moves.
3. In Loopia, replace the `staging.event` CNAME (`cname.vercel-dns.com`) with an A record to
   the Elastic IP.
4. Once `dig +short staging.event.vastrasidan.se @1.1.1.1` shows the box:
   `sudo certbot --apache -d staging.event.vastrasidan.se`. Until then, HTTPS on the box answers
   with another site's certificate, so staging shows a warning for those few minutes.
5. In Vercel, remove `staging.event.vastrasidan.se` from the project (Settings → Domains), and
   the `staging`-branch env vars, which nothing reads any more.

The Stripe test webhook stays `https://staging.event.vastrasidan.se/api/payment/stripeWebhook`
with the same secret.

**Rollback:** set the Loopia record back to CNAME `cname.vercel-dns.com`, and take `staging`
out of `vercel.json` so Vercel builds it again.
