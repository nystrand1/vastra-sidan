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

## User accounts rollout

> **Do not merge the PR into `main` until step 6.5. Merging is the deploy.** `deploy.yml`
> deploys `main` on every push, so merging the PR runs the new code at once. (Merging into
> `staging` deploys staging; see step 8, which you can do first.) Before step 6.4 the database does not
> have Better Auth's `Session`/`Verification` columns or `StripePayment.membershipId`, so admin
> sign-in and every Stripe webhook would fail.

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

**Before you start: origins.** Better Auth always trusts the origin of its base URL,
`BETTER_AUTH_URL`; `trustedOrigins` adds `WEBSITE_URL`. The passkey origin and the link in the
sign-in email are `BETTER_AUTH_URL` too. `deploy/apache-vss-event.conf` makes
`https://www.vastrasidan.se` canonical: the apex `vastrasidan.se` answers with a 308 redirect to
www (certbot copies that rule to the :443 vhost). So `WEBSITE_URL`, `NEXT_PUBLIC_WEBSITE_URL` and
`BETTER_AUTH_URL` must all be `https://www.vastrasidan.se`, and `PASSKEY_RP_ID` is
`vastrasidan.se` (a passkey's RP ID may be the parent domain of the origin). If you ever serve
both hosts without the redirect, sign-in from the host that is not `BETTER_AUTH_URL` or
`WEBSITE_URL` is rejected as an untrusted origin.

1. **Back up.** Run `sudo systemctl start mysql-backup.service` on the box and check it with
   `systemctl status mysql-backup.service`; the dump is `/var/backups/mysql/vss_prod-<date>.sql.gz`
   (`deploy/mysql-backup.sh`).
2. **Ship the payer-email half with login off.** Steps 2–4 run from a local checkout of commit
   `2925516`, the last commit of that half:
   ```bash
   git fetch origin
   git checkout 2925516
   pnpm install
   ```
   1. **Push the schema first.** With production's `DATABASE_URL` (through the tunnel):
      ```bash
      DATABASE_URL='mysql://vss:…@127.0.0.1:3307/vss_prod' pnpm prisma db push
      ```
      No flag is needed: at this commit the push only adds the nullable
      `StripePayment.payerEmail` and its index. The code running now never reads that column, so
      it is safe to add before the deploy. The other order is not: the new code reads and writes
      `payerEmail` on every `StripePayment` query and fails with "column does not exist" until
      the push.
   2. **Deploy `2925516`.** `deploy.yml` runs on every push to `main`, and by hand
      (`workflow_dispatch`). `2925516` sits directly on top of `main`, so fast-forward `main` to
      it; that push starts "Deploy to EC2":
      ```bash
      git merge-base --is-ancestor origin/main 2925516 && git push origin 2925516:main
      ```
      If the check fails, `main` has moved on: stop and rebase the branch first. If branch
      protection refuses a direct push to `main`, push the commit to a branch instead
      (`git push origin 2925516:refs/heads/accounts-rollout-1`), then in GitHub Actions run
      "Deploy to EC2" with "Use workflow from" set to `accounts-rollout-1`. That run checks out
      and deploys that branch, but only if the Production environment allows deployments from it
      (Settings → Environments → Production → Deployment branches); add it there for the run if
      not. Keep `NEXT_PUBLIC_ENABLE_LOGIN=false`. The workflow at this commit still reads
      `NEXTAUTH_SECRET` and `NEXTAUTH_URL`, so keep them until step 6.1.

   To deploy everything at once instead, skip step 2 and step 4's first run; do steps 3 and 5
   before step 6, and run the backfill in step 7.
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
   Membership payments are legitimately null here; step 7 fills them. Then go back to the PR's
   branch head for the rest (`git checkout claude/quirky-curie-a1r4on && git pull && pnpm install`).
5. **Check the admins and the old auth tables.** Admins sign in with an email code, so every admin
   needs a working address. `User.email` also becomes required, so the first count must be 0
   before step 6:
   ```sql
   SELECT COUNT(*) FROM User WHERE email IS NULL;
   SELECT id, firstName, lastName, email FROM User WHERE role = 'ADMIN';
   SELECT COUNT(*) FROM Account;
   SELECT COUNT(*) FROM Session;
   SELECT COUNT(*) FROM VerificationToken;
   ```
   Every admin on the second list must have an email they can open. Fix by hand if not. NextAuth
   ran with JWT sessions and the Credentials provider only, so the last three should be 0; any
   rows in them are worthless and step 6.4 deletes them.
6. **Prepare the switch.** In this order, from a checkout of the PR's branch head:
   1. On GitHub (Production environment), add the secret `BETTER_AUTH_SECRET` and the variables
      `BETTER_AUTH_URL` and `PASSKEY_RP_ID` (values above); delete `NEXTAUTH_SECRET` and
      `NEXTAUTH_URL`. `deploy.yml` on the branch already lists the new names in `ENV_NAMES`.
   2. Optionally fix the proxy header on the box (see "Rate limiting" below; recommended, no
      longer required).
   3. Pick a quiet window. Between 6.4 and 6.6 admin sign-in is unavailable, and between 6.4 and
      6.5 the site is mid-switch.
   4. Against production, **immediately before** the merge, empty the old auth tables and push:
      ```sql
      DELETE FROM Session; DELETE FROM Account; DELETE FROM VerificationToken;
      ```
      ```bash
      DATABASE_URL='mysql://vss:…@127.0.0.1:3307/vss_prod' pnpm prisma db push --accept-data-loss
      ```
      The push does **not** drop the old NextAuth `Account` and `Session` tables: it `ALTER`s
      them into Better Auth's, dropping the NextAuth columns and adding `NOT NULL` columns
      without defaults (`Session.token`, `expiresAt`, `updatedAt`; `Account.accountId`,
      `providerId`, `updatedAt`), and last of all creates the unique `Session_token_key`. If
      either table has rows, the push can fail partway, after `User.password` and
      `emailVerified` are already gone; MySQL DDL is not transactional, so nothing rolls back
      except the backup from step 1. Hence the `DELETE`s. It also drops `VerificationToken`, the
      `User`–`Membership` join table and `User.password`, replaces `emailVerified` (`DATETIME`)
      with a boolean that defaults to false, makes `User.email` `NOT NULL`, adds
      `StripePayment.membershipId`, and creates `Verification` and `Passkey`. The exact SQL is in
      "SQL of step 6.4" below. `relationMode = "prisma"` means the dropped `User` relations to
      participants and payments never had foreign keys in MySQL; the `userId` columns on
      `Participant`, `StripePayment` and `StripeRefund` are kept. The running code (`2925516`)
      cannot run after this (no `password`), so merge straight away.
   5. **Merge the PR now. This triggers the deploy** ("Deploy to EC2" runs on the push to `main`),
      with login still off. If the new code ran before the push, admin sign-in and the Stripe
      webhooks would fail; hence this order.
   6. **Immediately after the push**, run once:
      ```sql
      UPDATE User SET emailVerified = 1, name = CONCAT(firstName, ' ', lastName);
      ```
      (`name` is `VARCHAR(191)`.) It has no `WHERE`: run it once, while the table holds only the
      legacy rows. Until it has run, `emailVerified` is 0 and `name` is empty. Existing admin
      sessions stop working. Admins sign in again with a code at `/loggain?admin`; while login is
      off only admins are sent a code, sign-up is refused, and no other user can start a session.
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
8. **Staging.** This step stands on its own: do it before step 1 to try the feature first.
   `deploy.yml` deploys the `staging` branch to `vss-staging` on the box, so merging the accounts
   PR into `staging` is the staging deploy. Before merging:
   1. Through the tunnel, against `vss_dev` (not `vss_prod`): the step 5 checks, the `DELETE`s,
      `prisma db push --accept-data-loss` from a checkout of the PR branch, and the `UPDATE`
      (in that order, as in step 6). Then the normalise and backfill scripts with `vss_dev`'s
      `DATABASE_URL` and the Stripe **test** key.
   2. In the GitHub **`Staging`** environment: `BETTER_AUTH_SECRET` (secret, not the production
      one), and the vars `BETTER_AUTH_URL`, `WEBSITE_URL` and `NEXT_PUBLIC_WEBSITE_URL` set to
      `https://staging.event.vastrasidan.se`, `PASSKEY_RP_ID=staging.event.vastrasidan.se`, and
      `NEXT_PUBLIC_ENABLE_LOGIN=true`.
   3. Merge the PR into `staging`, and check that the workflow's port-3001 check passes.

   `vss-staging` sits behind Apache on the same box (`deploy/apache-vss-staging.conf`), so the
   rate limiter's `trustedProxies` setting covers it as it does production. Use
   `staging.event.vastrasidan.se` rather than `vastrasidan.se` as the RP ID, so passkeys made on
   staging are never offered on production.

   Vercel previews of other branches still use `vss_dev`. After the push above, a preview of a
   branch without the accounts change runs against the new schema: its old login and anything
   reading `User.password` will fail. Previews of branches based on the accounts change work.

   Go through: sign-up with a code, the link in the email, passkey on iOS Safari and Android
   Chrome (add it on `/profil`, which needs a fresh sign-in), signing in with the passkey,
   bookings on "Mina bussresor" (cancel, change bus, transfer), booking only for other people
   while signed in (the payer gets a "Din bokning" summary), "Mina medlemskap", and deleting
   the account.
9. **Production.** `NEXT_PUBLIC_ENABLE_LOGIN` is inlined at build time, so setting the
   variable on GitHub to `true` does nothing until the workflow runs again: set it, re-run "Deploy
   to EC2" (a rebuild and redeploy), then check `/loggain`, sign-up and one booking.

**Rate limiting (step 6.2, recommended).** `src/server/auth.ts` takes the client address from
`X-Forwarded-For` and trusts only `127.0.0.1` and `::1` as proxies
(`advanced.ipAddress.trustedProxies`). So it takes the rightmost address in the header that is
not one of those: the one Apache appended for the client. `mod_proxy` appends to a value the
client sent, but anything the client put there sits to the left and is ignored, so it can't dodge
the per-address limit by spoofing the header. Unsetting the header in Apache is still worth doing,
so nothing downstream ever sees a spoofed value. The repo's `deploy/apache-vss-event.conf` only
has the `:80` vhost; production traffic is served by the `:443` vhost certbot generated from it,
`/etc/apache2/sites-available/vss-event-le-ssl.conf` on the box. Add `RequestHeader unset
X-Forwarded-For` above the `ProxyPass` lines in **both** files (the repo copy so a re-install
keeps it, the SSL vhost on the server so it takes effect), then
`sudo apache2ctl configtest && sudo systemctl reload apache2`. Either way, verify:
```bash
curl -s -H 'X-Forwarded-For: 1.2.3.4' https://www.vastrasidan.se/api/auth/get-session -o /dev/null
```
and check that the address Better Auth records (`Session.ipAddress` after a sign-in, or the
Apache access log) is yours, not `1.2.3.4`. The per-address counters are in memory and reset on
restart. On top of them, each email gets at most 5 codes and 15 failed sign-ins an hour (also in
memory); a request over that limit gets the usual answer, but no code is sent or accepted.

**Rollback.** Set `NEXT_PUBLIC_ENABLE_LOGIN` back to `false` and redeploy. That closes sign-up
and stops new sessions for anyone but admins, by code or passkey (admin sign-in keeps working).
Sessions that already exist keep working until they expire, up to 14 days, unless you revoke
them:
```sql
DELETE FROM Session WHERE userId IN (SELECT id FROM User WHERE role <> 'ADMIN');
```
Rolling the code back past step 6 also needs the backup from step 1, because
`db push --accept-data-loss` is not reversible.

<details>
<summary><strong>SQL of step 6.4</strong> (what <code>db push</code> runs against a database at <code>2925516</code>)</summary>

Generated from the branch head with:

```bash
git show 2925516:prisma/schema.prisma > /tmp/schema-2925516.prisma
pnpm -s prisma migrate diff --from-schema /tmp/schema-2925516.prisma \
  --to-schema prisma/schema.prisma --script
```

```sql
-- DropIndex
DROP INDEX `Account_provider_providerAccountId_key` ON `Account`;

-- DropIndex
DROP INDEX `Session_sessionToken_key` ON `Session`;

-- AlterTable
ALTER TABLE `Account` DROP COLUMN `access_token`,
    DROP COLUMN `expires_at`,
    DROP COLUMN `id_token`,
    DROP COLUMN `provider`,
    DROP COLUMN `providerAccountId`,
    DROP COLUMN `refresh_token`,
    DROP COLUMN `session_state`,
    DROP COLUMN `token_type`,
    DROP COLUMN `type`,
    ADD COLUMN `accessToken` TEXT NULL,
    ADD COLUMN `accessTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `accountId` VARCHAR(191) NOT NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `idToken` TEXT NULL,
    ADD COLUMN `password` VARCHAR(191) NULL,
    ADD COLUMN `providerId` VARCHAR(191) NOT NULL,
    ADD COLUMN `refreshToken` TEXT NULL,
    ADD COLUMN `refreshTokenExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `Session` DROP COLUMN `expires`,
    DROP COLUMN `sessionToken`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `expiresAt` DATETIME(3) NOT NULL,
    ADD COLUMN `ipAddress` VARCHAR(191) NULL,
    ADD COLUMN `token` VARCHAR(191) NOT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `userAgent` TEXT NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `password`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `name` VARCHAR(191) NOT NULL DEFAULT '',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `firstName` VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY `lastName` VARCHAR(191) NOT NULL DEFAULT '',
    MODIFY `email` VARCHAR(191) NOT NULL,
    DROP COLUMN `emailVerified`,
    ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `StripePayment` ADD COLUMN `membershipId` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `VerificationToken`;

-- DropTable
DROP TABLE `_MembershipToUser`;

-- CreateTable
CREATE TABLE `Verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Verification_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Passkey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `publicKey` TEXT NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `credentialID` TEXT NOT NULL,
    `counter` INTEGER NOT NULL,
    `deviceType` VARCHAR(191) NOT NULL,
    `backedUp` BOOLEAN NOT NULL,
    `transports` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `aaguid` VARCHAR(191) NULL,

    INDEX `Passkey_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Session_token_key` ON `Session`(`token`);

-- CreateIndex
CREATE INDEX `StripePayment_membershipId_idx` ON `StripePayment`(`membershipId`);
```

</details>
