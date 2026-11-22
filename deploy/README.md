# Deploying to EC2

Production runs as a Next.js standalone server on the same EC2 box as MySQL and WordPress
(`ssh VastraAWS`, t3.small, Ubuntu 22.04). Apache terminates TLS and proxies to it.
Vercel only builds preview deployments.

```
Internet → Apache :443 (certbot) → node server.js on 127.0.0.1:3000 → MySQL on localhost
```

| Branch        | Built by                          | Runs on |
| ------------- | --------------------------------- | ------- |
| `main`        | `.github/workflows/deploy.yml`    | EC2     |
| anything else | Vercel                            | Vercel previews (`*.vercel.app`, `staging.event.vastrasidan.se`) |

The box has 2 GB of RAM, so it never builds. GitHub Actions builds a linux/amd64 release and the
box only unpacks and runs it.

## Users on the box

| User        | What it can do                                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `deploy`    | Logs in with the GitHub Actions key. Owns the releases. Its only sudo right is `systemctl restart vss-event`, and its only port forward is to MySQL on `127.0.0.1:3306` |
| `vss-event` | Runs the app (no login). Can write only `shared/cache` and each release's `.next/server/route-cache`. systemd also keeps it off `/home` and makes the rest of the system read-only |
| `ubuntu`    | Your login, with full sudo. Not used by deploys                                |

## Layout on the box

| Path                          | What                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `/srv/vss-event/releases/*`   | One unpacked release per deploy, the newest 5 are kept       |
| `/srv/vss-event/current`      | Symlink to the live release                                  |
| `/srv/vss-event/shared/.env`  | Production env (`deploy:vss-event`, mode 640), rewritten by every deploy |
| `/srv/vss-event/shared/cache` | `.next/cache` (ISR pages, optimised images), kept across deploys |
| `/etc/systemd/system/vss-event.service` | From `deploy/vss-event.service`                    |
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
| `BETTER_AUTH_SECRET`    | Signs sessions and sign-in links. `openssl rand -base64 32` |
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
| `BETTER_AUTH_URL`, `WEBSITE_URL`, `NEXT_PUBLIC_WEBSITE_URL` | `https://www.vastrasidan.se` |
| `PASSKEY_RP_ID`              | `vastrasidan.se` (the domain, no scheme) |
| `NEXT_PUBLIC_WORDPRESS_URL`  | `https://api.vastrasidan.se`             |
| `NEXT_PUBLIC_STRIPE_API_KEY` | Live publishable key                     |
| `NEXT_PUBLIC_ENABLE_MEMBERSHIPS`, `NEXT_PUBLIC_ENABLE_LOGIN`, `NEXT_PUBLIC_ENABLE_AWAYGAMES`, `NEXT_PUBLIC_ENABLE_ANALYTICS`, `ENABLE_AWS_SES_EMAILS`, `USE_DEV_MODE` | `true`/`false`, leave unset for the default |
| `CANCELLATION_URL`, `MEMBERSHIP_URL`, `API_URL`, `BOOKING_EMAIL` | As in Vercel        |
| `SENTRY_PROJECT_NAME`        | As in Vercel                             |

Vercel set `VERCEL_URL` and the code fell back to it. Nothing does that on EC2, so the URLs
above must be set.

A new env var needs three changes: `src/env.mjs`, the `ENV_NAMES` list in `deploy.yml`, and
a secret or variable on GitHub.

## Deploying

Push to `main`, or run the "Deploy to EC2" workflow by hand. `deploy/release.sh` swaps the
`current` symlink, restarts the service and checks that `/` and a database query answer. If
they don't, it switches back to the previous release.

Without GitHub: `deploy/build-local.sh path/to/production.env` builds in Docker on your machine
and deploys.

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

1. The `Production` environment on GitHub is filled in, with `BETTER_AUTH_URL` set to
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
  project (Settings → Domains). Keep `staging.event.vastrasidan.se`.
- Remove the dry-run host: `sudo a2dissite vss-event-test vss-event-test-le-ssl`,
  `sudo certbot delete --cert-name test-new-prod.vastrasidan.se`, and its A record in Loopia.

Previews on Vercel still connect to `vss_dev` over the public MySQL port, so it stays open.
Give them a user that can only touch `vss_dev`, and limit the production user to `localhost`.

## User accounts rollout

Passwordless accounts (Better Auth, email codes, passkeys) replace NextAuth. The schema change
is destructive and `User.email` becomes required, so go in this order and stop if a check fails.
Design: `docs/superpowers/specs/2026-11-22-user-accounts-design.md`.

Run scripts and SQL through the tunnel in "Reaching MySQL from your machine". The scripts are
plain `tsx`: it loads no `.env` and sets no `NODE_ENV`, and importing the database client runs the
env validation in `src/env.mjs`. So skip the validation and pass what the scripts read
(`DATABASE_URL`, and `STRIPE_API_KEY` for the backfill; with `SKIP_ENV_VALIDATION` the values
come straight from the process environment):

```bash
SKIP_ENV_VALIDATION=true NODE_ENV=production DATABASE_URL='mysql://vss:…@127.0.0.1:3307/vss_prod' \
  pnpm script scripts/accounts/normalise-emails.ts --dry-run
SKIP_ENV_VALIDATION=true NODE_ENV=production DATABASE_URL='mysql://vss:…@127.0.0.1:3307/vss_prod' \
  STRIPE_API_KEY='sk_live_…' pnpm script scripts/accounts/backfill-payer-emails.ts
```

`STRIPE_API_KEY` must be the **live** secret key when the database is production (a test key
finds none of the payment intents, and the rows fall back to the first traveller). Keep
`NEXT_PUBLIC_ENABLE_LOGIN` unset or `false` until step 9.

**Before you start: origins.** `trustedOrigins` is `[WEBSITE_URL]`, so exactly one origin is
allowed, and the passkey origin is `WEBSITE_URL` too. `deploy/apache-vss-event.conf` makes
`https://www.vastrasidan.se` canonical: the apex `vastrasidan.se` answers with a 308 redirect to
www (certbot copies that rule to the :443 vhost). So `WEBSITE_URL`, `NEXT_PUBLIC_WEBSITE_URL` and
`BETTER_AUTH_URL` must all be `https://www.vastrasidan.se`, and `PASSKEY_RP_ID` is
`vastrasidan.se` (a passkey's RP ID may be the parent domain of the origin). If you ever serve
both hosts without the redirect, sign-in from the other host is rejected as an untrusted origin.
That would be a required follow-up (add the second origin to `trustedOrigins`), not something
that works today.

1. **Back up.** Run `sudo systemctl start mysql-backup.service` on the box and check it with
   `systemctl status mysql-backup.service`; the dump is `/var/backups/mysql/vss_prod-<date>.sql.gz`
   (`deploy/mysql-backup.sh`).
2. **Deploy the payer-email half with login off.** Deploy the code up to and including commit
   `2925516` with `NEXT_PUBLIC_ENABLE_LOGIN=false`, then `pnpm prisma db push` (no flag needed: at
   that commit the push only adds `StripePayment.payerEmail` and its index). Skip this step and
   step 4's first run if you deploy everything at once; then do steps 3 and 5 before step 6, and
   run the backfill in step 7.
3. **Normalise emails.** With the invocation above:
   ```bash
   pnpm script scripts/accounts/normalise-emails.ts --dry-run
   ```
   It prints JSON and exits 1 if lowercasing would make two rows collide. Nothing is written then:
   merge the duplicates by hand and run again. When the dry run is clean, run it without
   `--dry-run`.
4. **Backfill event payers.** At this commit the backfill only covers event bookings, so it
   prints `fromStripe`, `fromFirstTraveller` and `adminComp` (no `memberships`). It aborts on any
   Stripe error other than a 404, so re-run it after a network or rate-limit failure; it only
   fills rows that are still empty. Until it has run, old bookings show each link only its own
   seat, which is safe. Check that no event payment is left without a payer:
   ```sql
   SELECT COUNT(*) FROM StripePayment
   WHERE payerEmail IS NULL AND id IN (SELECT B FROM _ParticipantToStripePayment);
   ```
   Membership payments are legitimately null here; step 7 fills them.
5. **Check the admins.** Admins sign in with an email code, so every admin needs a working
   address. `User.email` also becomes required, so the first count must be 0 before step 6:
   ```sql
   SELECT COUNT(*) FROM User WHERE email IS NULL;
   SELECT id, firstName, lastName, email FROM User WHERE role = 'ADMIN';
   ```
   Every admin on the second list must have an email they can open. Fix by hand if not.
6. **Prepare the switch.** In this order:
   1. On GitHub (Production environment), add the secret `BETTER_AUTH_SECRET` and the variables
      `BETTER_AUTH_URL` and `PASSKEY_RP_ID` (values above); delete `NEXTAUTH_SECRET` and
      `NEXTAUTH_URL`. `deploy.yml` already lists the new names in `ENV_NAMES`.
   2. Fix the proxy header (see "Rate limiting" below) on the box, before any traffic reaches the
      new code.
   3. Pick a quiet window. Between 6.4 and 6.6 admin sign-in is unavailable, and between 6.4 and
      6.5 the site is mid-switch.
   4. Run `pnpm prisma db push --accept-data-loss` against production, **immediately before** the
      deploy. It drops `User.password`, the old NextAuth `Account`, `Session` and
      `VerificationToken` tables (Better Auth creates its own `Session`, `Account`,
      `Verification` and `Passkey`), the `User`–`Membership` join table and the old `User`
      relations to participants and payments. `relationMode = "prisma"` means those relations
      never had foreign keys in MySQL; the `userId` columns on `Participant`, `StripePayment` and
      `StripeRefund` are kept. `emailVerified` changes from `DATETIME` to a boolean
      (`TINYINT(1)`); Prisma may convert or drop and recreate it, and the `UPDATE` below makes
      the result the same either way. The old code cannot run after this (no `password`), so
      deploy straight away.
   5. Run the "Deploy to EC2" workflow (login still off). If the new code runs before the push,
      admin sign-in fails instead; hence this order.
   6. **Immediately after the push**, run once:
      ```sql
      UPDATE User SET emailVerified = 1, name = CONCAT(firstName, ' ', lastName);
      ```
      (`name` is `VARCHAR(191)`.) It has no `WHERE`: run it once, while the table holds only the
      legacy rows. Until it has run, `emailVerified` is 0 and `name` is empty. Existing admin
      sessions stop working. Admins sign in again with a code at `/loggain?admin`; while login is
      off only admins are sent a code and sign-up is refused.
7. **Backfill membership payers.** The columns `StripePayment.membershipId` and the membership
   backfill only exist after step 6. Run the backfill again (with the invocation above):
   ```bash
   pnpm script scripts/accounts/backfill-payer-emails.ts
   ```
   It now also prints a `memberships` object with `fromStripe`, `fromOwnerMetadata`, `adminComp`,
   `unresolved` and `membershipIds`. `unresolved` payments are left without a payer on purpose
   (never guessed). Family entries on "Mina medlemskap" only appear for membership payments that
   have both a payer and a `membershipId`; others show each member just their own membership.
   Check:
   ```sql
   SELECT COUNT(*) FROM StripePayment WHERE payerEmail IS NULL;
   SELECT COUNT(*) FROM StripePayment
   WHERE membershipId IS NULL AND id IN (SELECT B FROM _MemberToStripePayment);
   ```
   The first should be only the unresolved ones. The second counts membership payments without a
   `membershipId`; some old ones may remain, which show no family (safe). `_MemberToStripePayment`
   is Prisma's join table for `Member`–`StripePayment`, `B` is the payment id.
8. **Staging first.** The preview at `staging.event.vastrasidan.se` uses the database `vss_dev`,
   so it needs everything above done to that database first: `prisma db push --accept-data-loss`
   and the same `UPDATE` (in that order, as in step 6), then the normalise and backfill scripts
   with `vss_dev`'s `DATABASE_URL` and the Stripe key that environment uses. On Vercel, set
   `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (`https://staging.event.vastrasidan.se`),
   `PASSKEY_RP_ID` (`staging.event.vastrasidan.se`, or `vastrasidan.se`) and
   `NEXT_PUBLIC_ENABLE_LOGIN=true`.

   **Required follow-up before staging can work:** `src/env.mjs` (lines 36-41) overrides
   `WEBSITE_URL` with `https://$VERCEL_URL` whenever `VERCEL_URL` is set, and that is the
   per-deployment host, not the staging alias. `trustedOrigins` and the passkey origin are both
   `WEBSITE_URL`, so sign-in on `staging.event.vastrasidan.se` is rejected as an untrusted
   origin, and passkeys fail. A fixed staging origin is not possible without a code change (use
   the explicit `WEBSITE_URL` when set, or add the staging host to `trustedOrigins`). Until
   then, test the whole flow in a local run against `vss_dev` instead, or sign in through the
   deployment's own `*.vercel.app` URL with `BETTER_AUTH_URL` and `PASSKEY_RP_ID` set to that host.

   Go through: sign-up with a code, the link in the email, passkey on iOS Safari and Android
   Chrome (add it on `/profil`, which needs a fresh sign-in), signing in with the passkey,
   bookings on "Mina bussresor" (cancel, change bus, transfer), "Mina medlemskap", and deleting
   the account.
9. **Production.** `NEXT_PUBLIC_ENABLE_LOGIN` is inlined at build time, so setting the
   variable on GitHub to `true` does nothing until the workflow runs again: set it, re-run "Deploy
   to EC2" (a rebuild and redeploy), then check `/loggain`, sign-up and one booking.

**Rate limiting (required, step 6.2).** `src/server/auth.ts` trusts `x-forwarded-for` for the
client address, and its counters are in memory (they reset on restart). `mod_proxy` appends to a
value the client sent, so a client could spoof the header and dodge the limit. The repo's
`deploy/apache-vss-event.conf` only has the `:80` vhost; production traffic is served by the
`:443` vhost certbot generated from it, `/etc/apache2/sites-available/vss-event-le-ssl.conf` on
the box. Add `RequestHeader unset X-Forwarded-For` above the `ProxyPass` lines in **both** files
(the repo copy so a re-install keeps it, the SSL vhost on the server so it takes effect), then
`sudo apache2ctl configtest && sudo systemctl reload apache2`. Verify:
```bash
curl -s -H 'X-Forwarded-For: 1.2.3.4' https://www.vastrasidan.se/api/auth/get-session -o /dev/null
```
and check that the address Better Auth records (`Session.ipAddress` after a sign-in, or the
Apache access log) is yours, not `1.2.3.4`. Without the header every visitor would share one
address and a few codes would lock everyone out.

**Rollback.** Set `NEXT_PUBLIC_ENABLE_LOGIN` back to `false` and redeploy to close sign-up (admin
sign-in keeps working). Rolling the code back past step 6 also needs the backup from step 1,
because `db push --accept-data-loss` is not reversible.
