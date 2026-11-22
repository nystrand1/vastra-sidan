# User accounts ("Mina sidor") — design

Date: 2026-11-22
Status: Implemented

## Changes during implementation

- Family entries on "Mina medlemskap" are shown without their card link.
- `membershipId` was added to `StripePayment`, so a membership payment records what it bought.
- Membership payments have a payer (`payerEmail`) too, and the backfill fills them.
- The `user` relations on `Participant`, `StripePayment` and `StripeRefund` were dropped; the
  `userId` columns stay.
- The link in the sign-in email submits the code, but it auto-submits only in the browser that
  asked for the code.
- The sign-in link carries the email and code in the fragment (`/loggain#email=…&kod=…`), not the
  query, so they never reach the Apache log, Google Analytics or Sentry.
- Adding a passkey needs a fresh session.
- The payer is not shown seats that other people transferred away, on "Mina bussresor" or the
  booking link: the seat row now holds the new holder's data. Whoever gave a seat away still sees
  it as transferred, built from the transfer record.
- Sign-in codes are also limited per email: at most 5 sends and 15 failed sign-ins per email per
  hour (in memory). Over the limit, a send answers as usual without making or sending a code, and
  a sign-in is rejected like a wrong code.
- While `ENABLE_LOGIN` is off, the auth server also refuses to create a session for anyone but an
  admin (codes and passkeys), not just to send them codes or create accounts. Existing sessions
  are not ended.
- The code email is sent in the background, so the send endpoint answers in the same time whether
  or not an email goes out.
- The passkey origin and the sign-in link use `BETTER_AUTH_URL`, which Better Auth always trusts,
  so a staging host works without code changes.

## Purpose

Today only admins can sign in. Everyone else manages a booking through the link in their
confirmation email (`/bortaresor/avboka?token=…`) and sees their membership card through the
member link (`/medlem/<memberToken>`). There is no place to see everything you have booked or
every membership you've held, and losing an email means asking the board.

This feature lets anyone create an account and sign in, without passwords and without a
third-party provider like Google, and gives them one place to:

- manage upcoming away-trip bookings (cancel, change bus, transfer),
- see past bookings,
- see current and past memberships.

Accounts are optional. Guest checkout and the email links keep working.

## Goals

- Passwordless sign-in: a 6-digit code (plus a link doing the same) sent by email.
- Passkeys as an optional, faster way to sign in once you have an account.
- Existing bookings and memberships show up in the account automatically, matched on verified
  email. No manual claiming.
- The payer of a booking manages every seat on it. A traveller manages only their own seat. The
  same rule applies to the email link.
- Proper session control: sign out on all devices, sessions revoked server-side, a removed admin
  loses access at once.

## Non-goals (v1)

- Passwords of any kind, including for admins.
- Google or any other OAuth / social login.
- Changing the email on an account (contact the board instead).
- Several family members sharing one email.
- An admin view or management of user accounts.
- A "remember this device" option beyond the normal session length.

## Anti-goals

- **Anyone seeing or touching someone else's booking or membership because they typed in that
  person's email.** Nothing tied to an email is shown until that email is verified in the
  current sign-in.
- Revealing whether an email has an account (no "no account found" message anywhere).
- Breaking the guest flow or the existing email links for people who never create an account.
- Admins being locked out during rollout.

## Decisions

| Question | Decision |
| --- | --- |
| Auth library | Migrate from NextAuth v4 to **Better Auth**. NextAuth v4 gets security fixes only since the Better Auth team took over Auth.js (Sept 2025); Better Auth has email OTP, passkeys, database sessions and rate limiting built in. Only admins have accounts today, so the migration is cheap now. |
| Sign-in methods | Email OTP (6 digits) with a link in the same email that signs you in too; passkeys added from the profile page. No passwords. |
| Passwords | Removed. The `User.password` column (unsalted SHA-256 today) is dropped. Admins sign in with email codes too. |
| Linking bookings and memberships | By verified email, at query time. `Participant.userEmail` already references `User.email`. Memberships are looked up via `Member.email`. No foreign-key backfill. |
| Email normalisation | Every email is stored trimmed and lowercased, everywhere. One-off clean-up of existing rows. |
| Who manages a booking | The **payer** manages every (non-transferred) seat on the payment. Each **traveller** manages only their own seat. Applies to accounts *and* the email link. |
| Payer identity | New `StripePayment.payerEmail`. Signed-in booking: the account email. Guest booking: the first traveller's email (today's `payee`). Backfilled for old payments. |
| Family memberships | The family owner sees the memberships bought on the same payment as one of their own memberships ("the family memberships I paid for"), not everything on members whose `familyMemberShipOwnerId` currently points at them (that link is rewritten each season by `linkFamilyMembers`). Each family member sees only their own. |
| Sign-up vs sign-in | Separate "Skapa konto" and "Logga in" pages that share the email-code step. Signing in with an unknown email does not error; it continues into account creation. |
| Profile prefill | After the email is verified, name and phone are prefilled from that email's latest `Member`, else latest `Participant`. Never before verification. |
| Sessions | Better Auth database sessions, about 14 days, renewed while in use. "Sign out on all devices" on the profile page. |
| Email change | Not allowed in v1. |
| Account deletion | Deletes the `User` row, its sessions and passkeys. Bookings, payments, refunds and memberships stay (bookkeeping), and the email links keep working. |
| Rollout | Behind `NEXT_PUBLIC_ENABLE_LOGIN`. Admin sign-in works regardless of the flag, as today (`/loggain?admin…`). Staging first. |
| Flag off, on the server | While `ENABLE_LOGIN` is off the auth server must not create accounts or sign in non-admins: the send-code endpoint answers exactly as usual but only actually sends a code to an existing `role = ADMIN` user, and user creation is refused. Hiding pages is not enough, since the auth API is public. |

## Approaches considered

- **A. Stay on NextAuth v4** and add email codes as a custom Credentials provider, a
  `sessionVersion` column for revocation, `@simplewebauthn` for passkeys, and hand-rolled rate
  limiting. Fewest files touched, but we'd own all the security-sensitive parts on a library
  that is in maintenance mode.
- **B. Migrate to Better Auth (chosen).** Every feature we need is a supported plugin. Costs a
  `User` schema change and a rewrite of every place that reads the session (~20 files including
  tests). Chosen because the migration will never be cheaper than now (admins only, no
  passwords to carry over).
- **C. Auth.js v5.** Long-running beta, now in maintenance. Rejected.

## Background: how things work today

- `src/server/auth.ts`: NextAuth v4, JWT sessions (30 days), one Credentials provider checking
  `sha256(password)`. Session carries `id, role, firstName, lastName, isMember, phone, email`.
  `isMember` comes from the unused `User.memberShips` many-to-many.
- `src/server/api/trpc.ts`: `createTRPCContext` calls `getServerAuthSession`. Procedures
  `protectedProcedure`, `userProcedure`, `adminProcedure` read `ctx.session.user`.
- Pages already exist behind `ENABLE_LOGIN`: `loggain.tsx`, `skapakonto.tsx` (password based,
  signs in before verifying), `profil.tsx`, `mina-bussresor.tsx`, `mina-medlemskap.tsx` (stub).
  `user.getProfile` lists bookings via `User.eventParticipations` (the `userEmail` relation).
  `user.verifyEmail` uses the user's id as the token. All of this is replaced.
- Every `Participant` is created with `userEmail = email`, and transfers update it
  (`src/server/utils/transferBooking.ts`).
- `Member.email` is unique. Family members are separate `Member` rows with their own email and
  `familyMemberShipOwnerId` pointing at the owner.
- `eventPayment.getManagableBooking` returns every non-transferred seat on the payment for
  **any** traveller's token, so today any traveller can cancel any other traveller's seat.
  Refunds always go to the card that paid.
- The payer is not stored. It is `input.participants[0]` in `requestStripePayment`, passed to
  Stripe as `payee` and forgotten.
- Every traveller gets their own confirmation email with their own token
  (`src/app/api/payment/stripeWebhook/route.ts` → `sendEventConfirmationEmail`).
- Tests: `test/helpers/caller.ts` builds sessions with the NextAuth `Session` type;
  `test/helpers/auth.ts` (`authBrowser`) drives the real NextAuth route; `test/auth/session.test.ts`.

## Data model

### `User` (changed, Better Auth core model)

Better Auth's user model needs `id, name, email, emailVerified (Boolean), image, createdAt,
updatedAt`. Map it onto the existing `User` table:

- `emailVerified`: `DateTime?` → `Boolean @default(false)`. Existing rows (admins) become `true`.
- add `name String` (Better Auth requires it; kept as `"firstName lastName"`), `createdAt`,
  `updatedAt`.
- keep `firstName`, `lastName`, `phone`, `role` as Better Auth `additionalFields`
  (`role` with `input: false` so it can never be set from the client).
- `email` becomes required (`String @unique`). Existing rows without an email: there should be
  none; the migration fails loudly if there are.
- drop `password`, the `memberShips` many-to-many (and its join table), and the relations to
  NextAuth's `Account` / `Session`.
- keep `eventParticipations`, `stripePayments`, `stripeRefunds` as they are.

Remove the `firstName @default("Västra")` / `lastName @default("Sidan")` defaults. A user with
no name yet has empty strings and is sent to the profile step (below).

### New Better Auth tables

`Session`, `Account`, `Verification`, `Passkey`, generated with the Better Auth CLI for the
Prisma adapter (provider `mysql`) and checked against `relationMode = "prisma"` (add `@@index`
on every foreign key, as the rest of the schema does). They replace NextAuth's unused
`Account`, `Session` and `VerificationToken` models.

### `StripePayment.payerEmail` (new)

`payerEmail String?` with `@@index([payerEmail])`. Nullable only until the backfill has run.

### Matching is on email columns, not relations

Account queries match seats on `Participant.email` (and payments on `StripePayment.payerEmail`),
members on `Member.email`. They do **not** go through the `User.eventParticipations` relation.
`Participant.userEmail` stays as it is (still written on create and transfer) but nothing new
depends on it.

Deleting a `User` must not touch bookkeeping rows. With `relationMode = "prisma"`, Prisma
emulates the default `SetNull` on optional relations, which would null `Participant.userEmail`,
`StripePayment.userId` and `StripeRefund.userId`. Set `onDelete: NoAction` on those three
relations (or remove the `userEmail` relation altogether; builder's choice), and cover it with a
test.

## Email normalisation

- One helper, `normaliseEmail(email) = email.trim().toLowerCase()`, used by every Zod schema that
  takes an email (`src/utils/zodSchemas.ts`; one already does it) and by Better Auth (which
  lowercases on its own; check it trims too).
- A one-off script lowercases and trims `User.email`, `Member.email`, `Participant.email`,
  `Participant.userEmail`, `ParticipantTransfer.fromEmail/toEmail` and (after backfill)
  `StripePayment.payerEmail`. `Member.email` is unique: the script first reports any rows that
  would collide after normalising and stops, so they can be merged by hand.
- Check the database collation. If it is already case-insensitive, matching works today and the
  script is hygiene; if not, it is required before launch.

## Auth server (`src/server/auth.ts`, rewritten)

- `betterAuth({ database: prismaAdapter(prisma, { provider: "mysql" }), … })`, mounted at
  `src/pages/api/auth/[...all].ts` (Pages Router handler). Delete `[...nextauth].ts`.
- Plugins:
  - `emailOTP`: 6-digit code, 10-minute expiry, a few attempts per code (library default 3 is
    fine). `sendVerificationOTP` sends the new `LoginCode` React Email template through the
    existing `sendSesEmail` (respecting the existing `USE_DEV_MODE` redirect). Sign-up through
    OTP stays enabled so first sign-in creates the account.
  - A sign-in link in the same email that completes the same OTP (e.g. `/loggain/kod?email=…&otp=…`
    which submits the code). One code, one email, two ways to use it. Builder may instead use
    Better Auth's `magicLink` plugin if the two can share one email cleanly.
  - `passkey`: relying party ID and origin from env (`vastrasidan.se` in prod, `localhost` in
    dev). Registration only when signed in.
- Rate limiting on, memory storage (single EC2 instance). Tighter limits on sending a code
  (per email and per IP) than on other routes.
- Session: database sessions, `expiresIn` ≈ 14 days, `updateAge` ≈ 1 day. Cookie cache may be
  turned on (≤ 5 min) to save a DB read per request; if so, admin removal takes up to that long.
- Trusted origins from env.
- Export `getServerAuthSession({ req, res })` returning a session object shaped like today's
  `ctx.session` (`user.id, role, firstName, lastName, phone, email, isMember`), so the tRPC
  middlewares and pages change as little as possible. `isMember` is computed from an active
  membership on the `Member` with the user's email (or on their family owner).
- Client: `src/utils/authClient.ts` with `createAuthClient` + `emailOTPClient()` +
  `passkeyClient()`. Replace every `useSession` / `signIn` / `signOut` from `next-auth/react`
  (Navigation, AdminLayout, admin pages, `_app.tsx`, account pages). Remove `SessionProvider`.
- New env vars in `src/env.mjs`: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, passkey RP id/name.
  Remove `NEXTAUTH_*`. Update `deploy/` env docs.
- Remove `next-auth` from `package.json`.

## Account flows (pages)

All copy in Swedish.

### Logga in (`src/pages/loggain.tsx`)

1. Email field and "Skicka kod". Also a "Logga in med passkey" button (uses the browser's
   conditional UI / autofill where available).
2. Code field. The same page handles the link from the email.
3. Signed in. If the profile is incomplete (no first name, last name or phone), go to the
   profile step; otherwise go to `callbackUrl` or `/mina-sidor`… (builder: keep existing
   `/profil` as the landing page if simpler).

Never says whether the email has an account. `/loggain?admin` keeps working when
`ENABLE_LOGIN` is off.

### Skapa konto (`src/pages/skapakonto.tsx`)

Same two steps as Logga in, with sign-up wording, then the profile step. Linked from Logga in
and the nav.

### Profile step

Shown once after the first verified sign-in, and whenever name or phone is missing. First name,
last name, phone, prefilled from the latest `Member` with that email, else the latest
`Participant` (split `name` on the first space). Saved through Better Auth's update-user (or
`user.updateProfile`), which also sets `name`.

### Profil (`src/pages/profil.tsx`)

- Edit first name, last name, phone. Email shown read-only with "Kontakta styrelsen för att
  byta email".
- Passkeys: list, add, remove.
- "Logga ut på alla enheter" (revoke all sessions).
- "Radera konto" with a confirm step. Text explains bookings and memberships are kept.

### Mina bussresor (`src/pages/mina-bussresor.tsx`)

Two sections, "Kommande" and "Tidigare", each listing seats with a succeeded payment:

- Seats where `Participant.email` = user's email (own seats).
- Plus every non-transferred seat on payments where `StripePayment.payerEmail` = user's email
  (seats the user paid for). A seat that was transferred away is shown read-only as "Överlåten".
- Grouped by event. Each seat shows name, bus, price, status (active, cancelled, refund pending,
  transferred).
- Upcoming seats the user may manage get the same controls as the link page: change bus, cancel,
  transfer, with the same rules (36-hour cutoff, non-refundable events, transferred seats can't be
  cancelled). Past seats are view-only.

Recommended: reuse the existing `ParticipantInfo` component from `avboka.tsx` (move it to
`src/components/common/`) and the existing token-based mutations (`cancelBooking`,
`changeBus`, `transferBooking`, `checkRefundStatus`). The account query returns a seat's
`cancellationToken` only when the user may manage that seat, so tokens stay the capability, as
today. No new mutations needed.

### Mina medlemskap (`src/pages/mina-medlemskap.tsx`)

"Aktiva" and "Tidigare", like the member page (`member.getMember`):

- Memberships on the `Member` with the user's email.
- If that member is a family owner, also family members' memberships, grouped under their name.
  Scope: only memberships on the same succeeded `StripePayment` as one of the owner's own
  memberships. Nothing else about family members is shown.
- Each active card links to the existing member card page (`/medlem/<memberToken>`) for the
  membership card itself. No need to rebuild the card.

### Navigation

Replace `next-auth` session reads. When `ENABLE_LOGIN` is on: "Logga in" when signed out;
"Mina bussresor", "Mina medlemskap", "Profil", "Logga ut" when signed in (the links already
exist).

### Prefill when signed in

- Booking form (`AwayGameForm`): first traveller prefilled from the account (name, email, phone),
  editable.
- Membership form (`bli-medlem`): owner fields prefilled, editable. The membership is still
  attached to `Member` by the email typed in; if that differs from the account email, it won't
  show in the account. Show a short note under the email field when it differs.

## Booking access rule (server)

### `requestStripePayment` (changed)

Set `StripePayment.payerEmail` = session user's email if signed in, else the first traveller's
(normalised) email.

### `admin.addParticipant` (changed)

Admin-added seats create a `StripePayment` with `stripePaymentId = "admin-comp-…"`. Set
`payerEmail` to that participant's email (they manage their own seat, nobody else's). The
backfill does the same for existing `admin-comp-` rows without calling Stripe.

### `getManagableBooking` (changed)

Given a traveller's token:

- If the holder's email equals the payment's `payerEmail` (and the seat is not transferred):
  return every non-transferred seat on the payment, as today.
- Otherwise: return only the holder's own seat.
- A transferred seat's current token: unchanged (the new holder manages only that seat).
- **The old token of a transferred seat (changed).** Today the old token from a seat's *first*
  transfer returns the whole group with tokens, which would let a non-payer transfer their seat
  and then manage everyone else's through the old link. New rule: return the group (with
  tokens) only if that first transfer's `fromEmail` equals the payment's `payerEmail`;
  otherwise return no seats, just the "Den här platsen har överlåtits" notice. So a payer whose
  own seat was transferred keeps managing the rest of the group from the old link, which follows
  "the payer manages every seat".

Because the page only ever receives tokens the visitor may manage, the token mutations need no
change. Several travellers may share the payer's email (a parent booking for children); each of
those links shows the whole booking, which is correct.

Note: refunds still go to the card that paid. A traveller cancelling their own seat refunds the
payer. That is today's behaviour; keep the existing wording.

### New `user` router queries

- `user.getMyBookings`: as described under Mina bussresor. `userProcedure`.
- `user.getMyMemberships`: as described under Mina medlemskap. `userProcedure`.
- `user.getProfilePrefill`: name and phone for the verified email (latest `Member`, else latest
  `Participant`). `userProcedure` only.

Remove `user.createNewUser`, `user.verifyEmail`, `user.getProfile`, and
`src/pages/medlem/verify/[id].tsx`, plus the `UserSignup` email template if unused elsewhere.

## Payer backfill (one-off script)

For every `StripePayment` linked to participants and with `payerEmail` null:

1. Retrieve the PaymentIntent from Stripe; use `receipt_email`, or the customer's email, if
   present.
2. Else, the earliest-created participant on the payment (ties broken by `id`), which matches
   how `requestStripePayment` creates them in order.

Normalise, write, log counts per source. Idempotent, runnable against staging first. Lives in
`scripts/` (or wherever existing one-off scripts are), run manually. Membership payments
(`members` instead of `participants`) don't need a payer for v1.

Check what `createPaymentIntent` actually sends to Stripe for `payee` before relying on
`receipt_email`.

## Emails

- New `LoginCode` React Email template: the code in large type, the sign-in link, "Koden gäller i
  10 minuter", and "Om du inte försökte logga in kan du ignorera det här mailet".
- `EventSignUp` and the member confirmation email get a line "Logga in på vastrasidan.se för
  att se alla dina resor / medlemskap" when `ENABLE_LOGIN` is on.

## Rollout

1. Ship the schema migration, normalisation and payer backfill with the flag off. The
   `getManagableBooking` narrowing ships here too (it doesn't depend on accounts).
2. Deploy Better Auth. Existing admin JWT sessions stop working; admins sign in once with an
   email code. Before deploy, check every admin row has a working email address.
3. Turn on `ENABLE_LOGIN` on staging, test end to end, then in production.

Order of schema migration vs. backfill: `payerEmail` must be populated before the narrowed
`getManagableBooking` is deployed, otherwise old bookings would show each traveller only their
own seat (safe, but a change for the payer). Run the backfill between the migration and the
deploy, or deploy the narrowing in the step after the backfill.

## Tests

Following `test/` conventions (`publicCaller` / `userCaller` / `adminCaller`, factories, MSW for
SES and Stripe):

- Rewrite `test/helpers/caller.ts` sessions to the new session shape, and `test/helpers/auth.ts`
  to drive the Better Auth route (`/api/auth/*`). Port `test/auth/session.test.ts`.
- Email OTP: request a code (SES mock captures it), sign in with it, wrong code rejected,
  expired code rejected, too many attempts locks the code, first sign-in creates the user.
- No enumeration: requesting a code for a known and an unknown email give the same response.
- Profile prefill: only returns data for the signed-in user's own email.
- `role` cannot be set through sign-up or update-user.
- `getManagableBooking`: payer token sees all seats; non-payer token sees only own seat;
  old token of a transferred seat shows the group only if it was the payer's seat, otherwise no
  seats (the existing transfer tests in `test/events/transfer.test.ts` need updating).
- With `ENABLE_LOGIN` off: a non-admin email gets the same response but no code and no account;
  an admin email gets a code.
- Deleting a user leaves `Participant.userEmail`, `StripePayment.userId`, `StripeRefund.userId`
  intact.
- `getMyBookings`: own seats, paid-for seats, transferred-away seat shown read-only without a
  token, cancelled and refunded states, upcoming vs past split.
- `getMyMemberships`: own memberships, family owner sees family, family member sees only own.
- `requestStripePayment` sets `payerEmail` for guest and signed-in bookings.
- Payer backfill script: Stripe email path, fallback path, idempotent.
- Email normalisation: mixed-case email at booking / membership signup matches the lowercased
  account.
- Revoking all sessions signs the user out; deleting the account keeps bookings and memberships.

Passkey flows are hard to test in Vitest; cover them by hand on staging (Chrome, Safari iOS,
Android).

## Left to the builder

- Exact Better Auth version and plugin options (check current docs; the plugin APIs have moved
  between minor versions).
- Whether to use `magicLink` alongside `emailOTP`, or a link that submits the OTP.
- Cookie cache on or off.
- Where the payer backfill and normalisation scripts live and how they're run.
- Exact landing page after sign-in.
- UI details of the pages, using existing atoms and shadcn components.
