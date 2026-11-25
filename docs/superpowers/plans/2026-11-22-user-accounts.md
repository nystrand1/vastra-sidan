# User Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let anyone create an account and sign in without a password (email code, passkeys), and see/manage their bookings and memberships, with the payer of a booking managing all its seats and each traveller only their own.

**Architecture:** Replace NextAuth v4 with Better Auth (email OTP + passkey + custom session plugins, database sessions) on the existing `User` table. Bookings and memberships are matched to an account by verified, normalised email at query time; a new `StripePayment.payerEmail` decides who manages the whole booking, both in the account and through the email link. Tasks 1–3 ship and run in production before Better Auth (flag off).

**Tech Stack:** Next.js 16 Pages Router, tRPC v11, Prisma 7 (MySQL, `relationMode = "prisma"`, schema applied with `prisma db push`), Better Auth `1.7.27` + `@better-auth/passkey` `1.7.27`, React Email + AWS SES, Vitest + Testcontainers + MSW.

**Spec:** `docs/superpowers/specs/2026-11-22-user-accounts-design.md` (read it first; this plan argues from it).

## Global Constraints

- All UI copy and email copy in Swedish.
- Every email that is stored or compared goes through `normaliseEmail` (trim + lowercase).
- No passwords anywhere. `User.password` is dropped; nothing hashes or checks passwords.
- Never show, prefill or return data tied to an email unless that email is the signed-in user's (verified by the sign-in itself).
- No response, page or error reveals whether an email has an account ("no account found" is forbidden).
- `role` can never be set from the client (Better Auth `additionalFields` with `input: false`; only admins via the DB).
- OTP: 6 digits, expires after 10 minutes (600 s), 3 attempts per code.
- Sessions: database sessions, `expiresIn` 14 days, `updateAge` 1 day, cookie cache **off** (revocation is instant).
- While `featureFlags.ENABLE_LOGIN` is false the server sends codes only to existing `role = ADMIN` users and refuses to create users; the API response is identical either way.
- Booking access rule: payer (`StripePayment.payerEmail`) manages every non-transferred seat on the payment; a traveller manages only their own seat. Same rule for the email link and the account.
- Family owner sees only memberships bought on the same succeeded `StripePayment` as one of their own memberships.
- Email cannot be changed on an account in v1.
- Deleting a `User` never modifies `Participant`, `StripePayment`, `StripeRefund` or `Member` rows.
- Use `~/` imports; import Prisma enums/types from `~/generated/prisma/browser` in anything a page can import.
- Tests: call routers through `publicCaller()` / `userCaller()` / `adminCaller()`, seed with `test/helpers/factories.ts`, drive Stripe with `fakeStripe`, read sent mail with `getSentEmails()`.

## Review Focus

1. **Mixed-case or padded emails** (`" Anna@Exempel.se"` at booking, `anna@exempel.se` at sign-in) must still match. Pinned in Task 1 and Task 7.
2. **Several travellers sharing the payer's email** (a parent booking for children under their own address): every one of those links and the account show and manage the whole booking. Pinned in Task 3 and Task 7.
3. **Signed in with a different email than the first traveller:** the account is the payer, and the first traveller's link shows only their own seat. Pinned in Task 2 and Task 3.
4. **Seats the viewer may see but not manage** (transferred away, someone else's seat on a booking they don't pay for) must never carry a `cancellationToken` in any response. Pinned in Task 3 and Task 7.
5. **Revoked or deleted sessions:** after "logga ut på alla enheter" or account deletion, the old cookie gets no session and `userProcedure` throws `UNAUTHORIZED`. Pinned in Task 4 and Task 6.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/utils/email.ts` (new) | `normaliseEmail` |
| `src/server/utils/accounts/normaliseStoredEmails.ts` (new) | One-off normalisation of stored emails, collision report |
| `src/server/utils/accounts/backfillPayerEmails.ts` (new) | One-off `payerEmail` backfill |
| `src/server/utils/accounts/bookingAccess.ts` (new) | `isPayer`, the shared booking access rule |
| `scripts/accounts/*.ts` (new) | Thin CLIs that run the two one-off functions |
| `src/server/auth.ts` (rewritten) | Better Auth instance, `AppSession`, `getServerAuthSession` |
| `src/server/utils/member/isMemberEmail.ts` (new) | Active-membership check by email |
| `src/components/emails/LoginCode.tsx` (new) | Login code email |
| `src/pages/api/auth/[...all].ts` (new) | Better Auth route; replaces `[...nextauth].ts` |
| `src/utils/authClient.ts` (new) | Better Auth React client |
| `src/components/common/EmailCodeSignIn/EmailCodeSignIn.tsx` (new) | Shared email → code step for Logga in / Skapa konto |
| `src/components/common/ParticipantInfo/ParticipantInfo.tsx` (moved from `avboka.tsx`) | Per-seat manage controls |
| `src/server/utils/user/getMyBookings.ts`, `getMyMemberships.ts`, `getProfilePrefill.ts` (new) | Account queries, called from `user` router |
| `test/accounts/*.test.ts` (new) | Tests for this feature |

---

### Task 1: Email normalisation

**Files:**
- Create: `src/utils/email.ts`, `src/server/utils/accounts/normaliseStoredEmails.ts`, `scripts/accounts/normalise-emails.ts`
- Modify: `src/utils/zodSchemas.ts` (every `email:` field), `package.json` (devDependency `tsx`, script `"script": "tsx"`)
- Test: `test/accounts/normalise.test.ts`

**Interfaces:**
- Produces: `normaliseEmail(email: string): string`
- Produces: `normaliseStoredEmails(db: PrismaClient, opts?: { dryRun?: boolean }): Promise<{ collisions: { table: "User" | "Member"; email: string; ids: string[] }[]; updated: Record<"User" | "Member" | "Participant" | "ParticipantTransfer" | "StripePayment", number> }>`. If `collisions` is non-empty it writes nothing.

- [ ] **Step 1: Write the failing tests** in `test/accounts/normalise.test.ts`:
  - `normaliseEmail(" Anna@Exempel.SE ")` → `"anna@exempel.se"`.
  - `"stores booking emails lowercased"`: `bookAndPay` with a traveller email `" Anna@Exempel.se"` → `participant.email` and `participant.userEmail` are `"anna@exempel.se"`.
  - `"stores membership emails lowercased"`: `signUpAndPay` with `"Bo@Exempel.se"` → `member.email === "bo@exempel.se"`.
  - `"normalises stored emails"`: insert a `Participant` (via prisma, bypassing schemas) with `email: "Ced@X.se "`, a `ParticipantTransfer` with `toEmail: "D@X.SE"` → after `normaliseStoredEmails(prisma)` both are lowercase/trimmed, `updated.Participant >= 1`.
  - `"refuses to normalise when two members would collide"`: two `Member` rows `"e@x.se"` and `"E@x.se"` (if the column collation is case-insensitive the insert itself fails; then assert that instead and skip, see Step 3) → result `collisions[0]` is `{ table: "Member", email: "e@x.se", ids: [both ids] }` and neither row changed.
- [ ] **Step 2: Run** `pnpm test test/accounts/normalise.test.ts`. Expected: FAIL (`normaliseEmail` not found).
- [ ] **Step 3: Check the collation.** `SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE COLUMN_NAME IN ('email','userEmail')` against the test container. Note the result in the commit message. If case-insensitive, the collision test asserts the unique-constraint failure instead.
- [ ] **Step 4: Implement** `normaliseEmail` and use it in every email field of `src/utils/zodSchemas.ts` (`z.string().trim().toLowerCase().email(...)`, or `.transform(normaliseEmail)` after `.email()`). Implement `normaliseStoredEmails`: find collisions on `User.email` and `Member.email` by grouping on `LOWER(TRIM(email))` first; otherwise run one `UPDATE … SET col = LOWER(TRIM(col)) WHERE col <> LOWER(TRIM(col))` per column via `$executeRaw` (`User.email`, `Member.email`, `Participant.email`, `Participant.userEmail`, `ParticipantTransfer.fromEmail`, `ParticipantTransfer.toEmail`; `StripePayment.payerEmail` once Task 2 adds it). The CLI prints the result and exits non-zero on collisions; `--dry-run` reports counts only.
- [ ] **Step 5: Run** `pnpm test test/accounts/normalise.test.ts` and the full `pnpm test`. Expected: PASS (existing tests that type mixed-case emails may need their expectations lowercased; change the expectation, not the behaviour).
- [ ] **Step 6: Commit** `Normalise emails on input and add a one-off normalisation script`.

### Task 2: Store the payer of a booking

**Files:**
- Modify: `prisma/schema.prisma` (`StripePayment.payerEmail String?` + `@@index([payerEmail])`), `src/server/api/routers/eventPayment.ts` (`requestStripePayment`), `src/server/api/routers/admin.ts` (`addParticipant`), `src/server/utils/accounts/normaliseStoredEmails.ts` (add `payerEmail`)
- Modify: `test/helpers/caller.ts` — `userCaller(user?: Partial<Session["user"]>)` and `adminCaller(user?: …)` merge overrides into today's defaults (Task 4 retypes these to `AppSession`)
- Create: `src/server/utils/accounts/backfillPayerEmails.ts`, `scripts/accounts/backfill-payer-emails.ts`
- Test: `test/accounts/payer.test.ts`

**Interfaces:**
- Consumes: `normaliseEmail` (Task 1).
- Produces: `StripePayment.payerEmail` populated for every new event payment.
- Produces: `userCaller({ email })` overrides, used by Tasks 3 and 6–8.
- Produces: `backfillPayerEmails(db: PrismaClient, stripe: Stripe): Promise<{ fromStripe: number; fromFirstTraveller: number; adminComp: number }>`; idempotent (only touches `payerEmail IS NULL` rows linked to at least one participant).

- [ ] **Step 1: Write the failing tests** in `test/accounts/payer.test.ts`:
  - `"records the first traveller as payer of a guest booking"`: `bookAndPay` with travellers A, B → payment's `payerEmail === A.email`.
  - `"records the signed-in user as payer even when they are not the first traveller"`: `userCaller({ email: "konto@test.se" }).eventPayment.requestStripePayment(...)` with travellers A, B → `payerEmail === "konto@test.se"`.
  - `"records an admin-added traveller as their own payer"`: `adminCaller().admin.addParticipant(...)` → the `admin-comp-…` payment's `payerEmail` is that traveller's email.
  - `"backfills the payer from the Stripe customer"`: booking, then set `payerEmail` null; `fakeStripe` PaymentIntent's customer email `"betalare@x.se"` → after `backfillPayerEmails(prisma, stripe)` `payerEmail === "betalare@x.se"` and `fromStripe === 1`.
  - `"falls back to the first-created traveller"`: Stripe customer has no email (or retrieve fails) → `payerEmail` is the participant with the earliest `createdAt`, ties by `id`; `fromFirstTraveller === 1`.
  - `"backfills admin bookings without calling Stripe"`: `admin-comp-` payment → participant's email, `adminComp === 1`, no Stripe request recorded.
  - `"running the backfill twice changes nothing"`.
- [ ] **Step 2: Run** `pnpm test test/accounts/payer.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `requestStripePayment`: `payerEmail: normaliseEmail(ctx.session?.user.email ?? payee.email)`. `addParticipant`: participant's email. Backfill: `stripe.paymentIntents.retrieve(id, { expand: ["customer"] })`, use `customer.email` (that's what `createPaymentIntent` in `src/utils/stripeHelpers.ts` sets, lowercased), else first traveller. Extend `fakeStripe` in `test/mocks/stripe.ts` only if `retrieve` with `expand[]=customer` isn't handled yet. Run `pnpm prisma db push` against the test setup (globalSetup does this).
- [ ] **Step 4: Run** the new tests and full `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Store the payer email on event payments, with a backfill script`.

### Task 3: Narrow the booking link to payer vs traveller

**Files:**
- Create: `src/server/utils/accounts/bookingAccess.ts`
- Modify: `src/server/api/routers/eventPayment.ts` (`getManagableBooking`, `findBookingParticipant` select must include the payment's `payerEmail` and the first transfer's `fromEmail`)
- Modify: `test/events/transfer.test.ts` (the "managing a transferred seat" group, see Step 1)
- Test: `test/accounts/manage-access.test.ts`

**Interfaces:**
- Consumes: `StripePayment.payerEmail` (Task 2), `normaliseEmail`.
- Produces: `isPayer(email: string, payerEmail: string | null): boolean` (both normalised, `false` when `payerEmail` is null). Task 7 uses it.

- [ ] **Step 1: Write the failing tests** in `test/accounts/manage-access.test.ts`:
  - `"shows the payer's link every seat"`: A (payer), B, C → `getManagableBooking({ token: A.token }).participants` has 3 entries, each with a `cancellationToken`.
  - `"shows a traveller's link only their own seat"`: `B.token` → exactly `[B]`.
  - `"shows every link that shares the payer's email the whole booking"`: A and child both with A's email → both tokens return all seats.
  - `"shows the first traveller only their own seat when a signed-in user paid"`: booked via `userCaller({ email: "konto@test.se" })` → `A.token` returns `[A]`.
  - `"shows the payer's old link the rest of the group after the payer's seat is transferred"`: transfer A's seat to D → old A token returns B, C (with tokens), `transferredAway: true`.
  - `"shows a traveller's old link nothing after their seat is transferred"`: transfer B's seat → old B token returns `participants: []`, `transferredAway: true`.
  - `"does not let a traveller act on another seat"`: assert `B.token`'s response contains no other `cancellationToken` (pins Review Focus 4).
  In `test/events/transfer.test.ts`, update the tests whose old link expected the group (`"shows the group's old link that the seat has been transferred"`, `"keeps showing the group's old link the rest of the group after an onward transfer"`): make the transferred seat the payer's where the test is about the group, and add the non-payer expectation (`[]`) where it isn't. Keep `"lets someone in the group transfer another traveller's seat"` as is (token mutations are unchanged; the token is the capability).
- [ ] **Step 2: Run** `pnpm test test/accounts/manage-access.test.ts test/events/transfer.test.ts`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** in `getManagableBooking`: non-transferred holder → `isPayer(holder.email, payment.payerEmail) ? groupParticipants(holder) : [holder]`. Old token of first transfer → group only if `isPayer(firstTransfer.fromEmail, payment.payerEmail)`, else `[]`. Later transfers' old tokens: unchanged (`[]`). Payments with `payerEmail` null (not yet backfilled) → own seat only.
- [ ] **Step 4: Run** the tests above and full `pnpm test`. Expected: PASS.
- [ ] **Step 5: Commit** `Let only the payer's link manage the whole booking`.

> Tasks 1–3 are a deployable unit with `ENABLE_LOGIN` off. Rollout order is in Task 10.

### Task 4: Better Auth on the server

**Files:**
- Modify: `prisma/schema.prisma`, `src/env.mjs`, `.env.example`, `.env.test`, `package.json`, `src/server/api/trpc.ts`, `test/helpers/caller.ts`, `test/helpers/auth.ts`, `test/helpers/factories.ts` (`createUser`)
- Rewrite: `src/server/auth.ts`
- Create: `src/pages/api/auth/[...all].ts`, `src/server/utils/member/isMemberEmail.ts`, `src/components/emails/LoginCode.tsx`
- Delete: `src/pages/api/auth/[...nextauth].ts`
- Test: rewrite `test/auth/session.test.ts`; create `test/accounts/sign-in.test.ts`

**Interfaces:**
- Consumes: `normaliseEmail`, `featureFlags.ENABLE_LOGIN`, `sendSesEmail`.
- Produces (all from `src/server/auth.ts`):
  - `auth` — the Better Auth instance (its type is used by the client in Task 5).
  - `type AppSession = { user: { id: string; role: Role; firstName: string; lastName: string; name: string; email: string; phone: string; isMember: boolean } }`
  - `getServerAuthSession(ctx: { req: IncomingMessage }): Promise<AppSession | null>` — `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` mapped to `AppSession`.
- Produces: `isMemberEmail(db: PrismaClient, email: string): Promise<boolean>` — a `Member` with that email has a membership with `endDate >= now`.
- Produces: `createInnerTRPCContext({ session: AppSession | null, … })`; `ctx.session.user` keeps today's field names.
- Produces (tests): `userCaller` / `adminCaller` retyped to `Partial<AppSession["user"]>` overrides; `authBrowser()` with `sendCode(email: string): Promise<{ status: number; body: unknown }>`, `signIn(email: string, otp: string): Promise<{ status: number }>`, `getSession(): Promise<AppSession-like | null>`, `revokeSessions()`, `signOut()`; `lastLoginCode(email: string): string | null` reading the 6-digit code from `getSentEmails()`. `createUser({ role? , email? })` returns `{ user }` (no password).

- [ ] **Step 1: Schema.** In `prisma/schema.prisma`:
  - `User`: `email String @unique` (required); `emailVerified Boolean @default(false)`; add `name String @default("")`, `createdAt DateTime @default(now())`, `updatedAt DateTime @default(now()) @updatedAt` (DB defaults so `db push` works on the existing rows); `firstName String @default("")`, `lastName String @default("")`; drop `password`, `memberShips`; relations `sessions Session[]`, `accounts Account[]`, `passkeys Passkey[]`.
  - `Membership`: drop `users User[]`.
  - Replace NextAuth's `Account`, `Session`, `VerificationToken` with Better Auth's `Account`, `Session`, `Verification`, `Passkey`. Generate them with `pnpm dlx @better-auth/cli@1.7.27 generate` against the new config (Step 4), then add `@@index` on every foreign key and `@db.Text` on long strings (`token` stays `String @unique`; `publicKey`, `credentialID`, `idToken`, `accessToken`, `refreshToken`, `userAgent`, `Verification.value` → `@db.Text`).
  - `Participant.user`, `StripePayment.user`, `StripeRefund.user`: add `onDelete: NoAction, onUpdate: NoAction`.
- [ ] **Step 2: Write the failing tests.** `test/accounts/sign-in.test.ts`:
  - `"signs in with a code sent by email and creates the account"`: `browser.sendCode("ny@x.se")` → one email to `ny@x.se` with subject `"Din inloggningskod till Västra Sidan"`; `browser.signIn("ny@x.se", lastLoginCode(...))` → session with `email: "ny@x.se"`, `role: "USER"`; `prisma.user` row has `emailVerified: true`.
  - `"normalises the email"`: `sendCode(" Ny@X.se ")` then `signIn("ny@x.se", code)` → works, one user row.
  - `"rejects a wrong code"`, `"rejects an expired code"` (move `Verification.expiresAt` into the past), `"locks the code after 3 wrong attempts"` (4th try with the right code fails).
  - `"answers the same for known and unknown emails"`: `sendCode` for an existing user and a new email return equal `status` and `body`.
  - `"does not let sign-up set the role"`: send `role: "ADMIN"` in the sign-in body → user is `USER`.
  - `"with login disabled, sends a code only to admins"` (set `featureFlags.ENABLE_LOGIN = false` in the test, restore in `afterEach`): unknown email and existing `USER` → same response as admin, no email sent, no user created; existing `ADMIN` → email sent, sign-in works.
  - `"revokes every session"`: two browsers signed in as the same user, one calls `revokeSessions()` → both `getSession()` are null (pins Review Focus 5).
  - `"puts membership status on the session"`: user whose email has an active `Member` membership → `isMember: true`.
  `test/auth/session.test.ts`: port to the new browser: `"reloads the profile from the database"` (update via prisma, `getSession()` reflects it with no update call), `"picks up a role change made in the database"`, and `"ignores a role sent by the browser"` (POST `/api/auth/update-user` with `{ role: "ADMIN", firstName: "Hacker" }` → role unchanged and firstName unchanged, since all additional fields are `input: false`).
- [ ] **Step 3: Run** `pnpm test test/accounts/sign-in.test.ts test/auth`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - `pnpm add better-auth@1.7.27 @better-auth/passkey@1.7.27`.
  - `src/env.mjs`: server `BETTER_AUTH_SECRET` (required in production, optional otherwise), `BETTER_AUTH_URL` (url), `PASSKEY_RP_ID` (string, e.g. `vastrasidan.se` / `localhost`); remove `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Update `.env.example` and `.env.test` (`BETTER_AUTH_URL="http://localhost:3000"`, `PASSKEY_RP_ID="localhost"`).
  - `src/server/auth.ts`: `betterAuth({ database: prismaAdapter(prisma, { provider: "mysql" }), baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET, trustedOrigins: [env.WEBSITE_URL], advanced: { database: { generateId: false }, ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } }, session: { expiresIn: 60*60*24*14, updateAge: 60*60*24 }, user: { additionalFields: { firstName, lastName, phone, role } (all input: false; role defaultValue "USER") }, rateLimit: { storage: "memory", customRules: { "/email-otp/send-verification-otp": { window: 60, max: 3 }, "/sign-in/email-otp": { window: 60, max: 10 } } }, databaseHooks: { user: { create: { before: refuse when !featureFlags.ENABLE_LOGIN } } }, plugins: [emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 3, sendVerificationOTP }), passkey({ rpID: env.PASSKEY_RP_ID, rpName: "Västra Sidan", origin: env.WEBSITE_URL }), customSession(adds isMember via isMemberEmail)] })`. Rate limiting keeps the library default (production only).
  - `sendVerificationOTP({ email, otp })`: if `!featureFlags.ENABLE_LOGIN`, look up the user and return silently unless `role === ADMIN`. Otherwise send `LoginCode` through `sendSesEmail` with subject `"Din inloggningskod till Västra Sidan"`. Errors are captured with Sentry and not rethrown (same response either way).
  - `LoginCode.tsx` props `{ code: string; signInUrl: string }`; `signInUrl = ${env.WEBSITE_URL}/loggain?email=${encodeURIComponent(email)}&kod=${otp}`. Copy: the code large, a "Logga in" button to the link, "Koden gäller i 10 minuter.", "Om du inte försökte logga in kan du ignorera det här mailet."
  - `src/pages/api/auth/[...all].ts`: `export const config = { api: { bodyParser: false } }; export default toNodeHandler(auth.handler)`.
  - `src/server/api/trpc.ts`: `createTRPCContext` uses the new `getServerAuthSession({ req })`; `createInnerTRPCContext` takes `AppSession | null`.
  - `test/helpers/auth.ts`: cookie-jar browser over `auth.handler(new Request(\`${BETTER_AUTH_URL}/api/auth/${path}\`, { method, headers: { origin, cookie, content-type }, body }))`, storing `set-cookie`. `getSession` returns the `customSession` user mapped like `getServerAuthSession`.
- [ ] **Step 5: Run** `pnpm test`. Expected: PASS, full suite.
- [ ] **Step 6: Commit** `Replace NextAuth with Better Auth on the server`.

### Task 5: Better Auth in the browser

**Files:**
- Create: `src/utils/authClient.ts`
- Modify: `src/pages/_app.tsx` (drop `SessionProvider`), `src/components/layouts/Navigation.tsx`, `src/components/layouts/AdminLayout.tsx`, `src/pages/admin/index.tsx`, `src/pages/admin/events/index.tsx`, `src/pages/admin/events/[id]/index.tsx`, `src/pages/admin/members/index.tsx`, `src/pages/admin/members/[id].tsx`, `package.json` (remove `next-auth`)

**Interfaces:**
- Consumes: `auth` type (Task 4).
- Produces: `authClient = createAuthClient({ plugins: [emailOTPClient(), passkeyClient(), customSessionClient<typeof auth>(), inferAdditionalFields<typeof auth>()] })`; `useAppSession(): { user: AppSession["user"] | null; isPending: boolean; refetch: () => Promise<void> }` wrapping `authClient.useSession()`.

- [ ] **Step 1: Implement** `authClient` and `useAppSession`, replace every `useSession`/`signIn`/`signOut` import from `next-auth/react` with them (`signOut` → `authClient.signOut()` then `router.push("/")`). Remove `next-auth` from `package.json`. `grep -rn "next-auth" src test` must return nothing.
- [ ] **Step 2: Verify** `pnpm lint` and `pnpm build` pass, then `pnpm test`. Expected: all green.
- [ ] **Step 3: Verify by hand** (`pnpm dev` with local MariaDB): `/loggain?admin` still renders (the old page until Task 6), admin pages redirect/hide when signed out.
- [ ] **Step 4: Commit** `Use the Better Auth client in the browser`.

### Task 6: Sign-in, sign-up and profile pages

**Files:**
- Create: `src/components/common/EmailCodeSignIn/EmailCodeSignIn.tsx`, `src/server/utils/user/getProfilePrefill.ts`
- Rewrite: `src/pages/loggain.tsx`, `src/pages/skapakonto.tsx`, `src/pages/profil.tsx`
- Modify: `src/server/api/routers/user.ts` (remove `createNewUser`, `verifyEmail`, `getProfile`; add `getProfilePrefill`, `deleteAccount`; `updateProfile` also sets `name`), `src/utils/zodSchemas.ts` (remove `signupSchema`)
- Delete: `src/pages/medlem/verify/[id].tsx`, `src/components/emails/UserSignup.tsx`
- Test: `test/accounts/profile.test.ts`

**Interfaces:**
- Consumes: `authClient`, `useAppSession` (Task 5); `userCaller` (Task 4).
- Produces: `user.getProfilePrefill(): Promise<{ firstName: string; lastName: string; phone: string } | null>` (`userProcedure`): latest `Member` by the session email, else latest `Participant` (split `name` on the first space), else null.
- Produces: `user.updateProfile(input: profileSchema)` — writes `firstName`, `lastName`, `phone`, `name = "first last"`; never email.
- Produces: `user.deleteAccount(): Promise<{ status: 200 }>` — deletes the user's `Session`, `Account`, `Passkey` rows and the `User` in one transaction.
- Produces: `<EmailCodeSignIn intro: string; onSignedIn: () => void />` — email step, code step, passkey button, handles `?email=&kod=` by submitting the code on mount.
- Produces: `isProfileComplete(user: AppSession["user"]): boolean` (in `src/utils/profile.ts`) — first name, last name and phone all non-empty.

- [ ] **Step 1: Write the failing tests** in `test/accounts/profile.test.ts`:
  - `"prefills from the latest membership"`: `Member` for `userCaller().email` with name/phone → returned.
  - `"prefills from the latest booking when there is no membership"`: participant `"Anna Maria Svensson"` → `{ firstName: "Anna", lastName: "Maria Svensson", … }`.
  - `"never prefills from another email"`: data only for `other@x.se` → `null`.
  - `"saves the profile and keeps the email"`: `updateProfile` → `name === "Bertil Bortafan"`, email unchanged.
  - `"deletes the account but keeps bookings and memberships"`: user with a booking (`userEmail` set) and a `Member` → after `deleteAccount` no `User`/`Session`/`Passkey`; `Participant.userEmail`, `StripePayment` and `Member` unchanged; through `authBrowser`, the old cookie gets `getSession() === null` (pins Review Focus 5).
- [ ] **Step 2: Run** `pnpm test test/accounts/profile.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the procedures. Then the pages:
  - `/loggain`: `EmailCodeSignIn` with intro "Logga in med din email. Vi skickar en kod." After sign-in: `isProfileComplete` ? `router.push(callbackUrl ?? "/profil")` : `router.push("/profil")`. Link "Inget konto? Skapa konto". Keep the `?admin` exception when `ENABLE_LOGIN` is off. Never shows "no account found".
  - `/skapakonto`: same component, intro "Skapa konto med din email. Vi skickar en kod.", then `/profil`. 404 when `ENABLE_LOGIN` is off.
  - `/profil`: when incomplete, heading "Välkommen!" and the form prefilled from `getProfilePrefill`; otherwise "Profil". Form: förnamn, efternamn, telefon, read-only email with "Kontakta styrelsen för att byta email". Sections: Passkeys (list via `authClient.passkey.listUserPasskeys`, "Lägg till passkey", remove), "Logga ut på alla enheter" (`authClient.revokeSessions()` then to `/`), "Radera konto" behind a confirm dialog ("Dina bokningar och medlemskap sparas, men du kan inte längre se dem här.").
  - After `updateProfile`, call `refetch()` from `useAppSession`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm build`. Expected: PASS.
- [ ] **Step 5: Verify by hand:** sign up with a new email (code from the dev console or SES), complete profile, add a passkey in Chrome, sign out, sign in with the passkey, open the link from the email in a second browser.
- [ ] **Step 6: Commit** `Add passwordless sign-in, sign-up and profile pages`.

### Task 7: Mina bussresor

**Files:**
- Create: `src/server/utils/user/getMyBookings.ts`, `src/components/common/ParticipantInfo/ParticipantInfo.tsx` (moved out of `src/pages/bortaresor/avboka.tsx`)
- Modify: `src/server/api/routers/user.ts` (`getMyBookings`), `src/server/api/routers/eventPayment.ts` (export `participantFormatter` and the `findBookingParticipant` include so they're reused), `src/pages/bortaresor/avboka.tsx` (import the moved component), `src/pages/mina-bussresor.tsx` (rewrite)
- Test: `test/accounts/my-bookings.test.ts`

**Interfaces:**
- Consumes: `isPayer` (Task 3), `participantFormatter`.
- Produces: `user.getMyBookings(): Promise<{ upcoming: MyTrip[]; past: MyTrip[] }>` (`userProcedure`), where
  `MyTrip = { eventId: string; eventName: string; date: Date; departureTime: string; isTrain: boolean; refundable: boolean; buses: { id; name; seats; availableSeats; _count: { passengers } }[]; seats: MySeat[] }` and
  `MySeat = ReturnType<typeof participantFormatter> & { isOwn: boolean; transferredAway: boolean }`, with `cancellationToken` set to `null` unless the seat is manageable (own non-transferred-away seat, or the user is payer and the seat is not transferred), and always `null` for past trips.
- Produces: `ParticipantInfo` props unchanged, plus `onChanged: () => Promise<unknown>` replacing its internal `getManagableBooking` refetch.

- [ ] **Step 1: Write the failing tests** in `test/accounts/my-bookings.test.ts` (all through `userCaller({ email })`):
  - `"lists my own seat on someone else's booking, without the others"`: A pays for A, B; as B → one trip, one seat (B), with token.
  - `"lists every seat I paid for"`: as A → B's seat included, `isOwn: false`, with token.
  - `"lists seats I paid for when I wasn't travelling"`: booked signed in as `konto@test.se` for A, B → both seats, with tokens.
  - `"matches emails regardless of case"`: booking with `" Anna@X.se"`, caller `anna@x.se` → found (Review Focus 1).
  - `"lists every seat under my email when I booked my children with it"`: A + child both A's email → two own seats (Review Focus 2).
  - `"shows a seat transferred away as transferred, without a token"`: A transfers own seat to D → as A, seat with `transferredAway: true`, `cancellationToken: null`; as D → the seat, own, with token.
  - `"shows cancelled and refund-pending seats"`: flags from `participantFormatter` carried through.
  - `"puts past trips in past with no tokens"`: event date in the past → `past`, tokens null.
  - `"leaves out unpaid bookings"`: `book` without paying → not listed.
  - `"never returns a token for a seat I can't manage"`: over every response above, every non-manageable seat has `cancellationToken === null` (Review Focus 4).
- [ ] **Step 2: Run** `pnpm test test/accounts/my-bookings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `getMyBookings`: participants with a succeeded payment where `email = me` OR a payment's `payerEmail = me`; plus seats whose transfer `fromEmail = me` for the "transferred away" rows. Group by event, sort upcoming ascending, past descending.
- [ ] **Step 4: Implement the page.** `/mina-bussresor`: "Kommande resor" and "Tidigare resor"; per trip a card (reuse `Card`) with event name, date, departure time, and a `ParticipantInfo` per seat that has a token; seats without a token render read-only (name, status text: "Avbokad", "Återbetalning behandlas", "Överlåten"). Empty states: "Du har inga kommande resor." / "Inga tidigare resor."
- [ ] **Step 5: Run** `pnpm test`, `pnpm lint`, `pnpm build`. Expected: PASS. Verify `avboka.tsx` by hand still works (cancel, change bus, transfer).
- [ ] **Step 6: Commit** `Add Mina bussresor`.

### Task 8: Mina medlemskap

**Files:**
- Create: `src/server/utils/user/getMyMemberships.ts`
- Modify: `src/server/api/routers/user.ts` (`getMyMemberships`), `src/pages/mina-medlemskap.tsx` (rewrite)
- Test: `test/accounts/my-memberships.test.ts`

**Interfaces:**
- Produces: `user.getMyMemberships(): Promise<{ own: { memberToken: string; active: MembershipCard[]; expired: MembershipCard[] } | null; family: { name: string; memberToken: string; memberships: MembershipCard[] }[] }>` where `MembershipCard = { id: string; name: string; imageUrl: string; textureUrl: string | null; type: string; expiresAt: Date }` (same mapping as `member.getMember`).
- Family rule: for each succeeded `StripePayment` linked to the user's `Member` (`StripePayment.members`), every *other* member on that payment, with only the memberships whose season matches that payment. Implementation hint: a payment buys one membership season; match the family member's memberships on the `Membership` the owner's member got from that payment.

- [ ] **Step 1: Write the failing tests** (use `signUpAndPay` with `familyMember()` from factories):
  - `"lists my active and expired memberships"`: two seasons, one ended (`endSeason`) → one each.
  - `"returns nothing when my email has no member"`: `own: null, family: []`.
  - `"shows the family memberships I paid for"`: owner buys FAMILY with members X, Y → as owner, `family` has X and Y with that membership.
  - `"keeps last season's family after the family changes"`: next season the owner buys with X only; Y buys REGULAR alone → as owner, Y shows only last season's family membership, not the REGULAR one.
  - `"does not show a family member the rest of the family"`: as X → `family: []`, own memberships only.
- [ ] **Step 2: Run** `pnpm test test/accounts/my-memberships.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the query and the page: "Aktiva medlemskap" / "Tidigare medlemskap"; each active card links to `/medlem/<memberToken>` ("Visa medlemskort"); a "Familj" section per family member. Empty state with a link to `/bli-medlem`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `Add Mina medlemskap`.

### Task 9: Prefill forms and point emails at the account

**Files:**
- Modify: `src/components/common/AwayGameForm/AwayGameForm.tsx`, `src/pages/bli-medlem/index.tsx`, `src/components/emails/EventSignUp.tsx`, `src/components/emails/MemberSignUp.tsx`, `src/server/utils/email/sendEventConfirmationEmail.ts`, `src/server/utils/email/sendMemberConfirmationEmail.ts`, `src/components/layouts/Navigation.tsx`
- Test: `test/accounts/emails.test.ts`

**Interfaces:**
- Consumes: `useAppSession` (Task 5).
- Produces: `EventSignUp` and `MemberSignUp` take `showAccountLink: boolean` (callers pass `featureFlags.ENABLE_LOGIN`).

- [ ] **Step 1: Write the failing tests:** `"links to the account from the booking confirmation when login is on"` → `bookAndPay`, the email html contains `"Logga in på vastrasidan.se för att se alla dina resor"` and `${WEBSITE_URL}/loggain`; with `featureFlags.ENABLE_LOGIN = false` it doesn't. Same for membership (`"…alla dina medlemskap"`).
- [ ] **Step 2: Run** `pnpm test test/accounts/emails.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Emails as tested. Forms: when signed in, first traveller / owner fields default to the account's `firstName`, `lastName`, `email`, `phone` (editable). In `bli-medlem`, when the owner email differs from the account email, show under the field: "Medlemskapet syns bara på ditt konto om du använder samma email som kontot." Navigation: signed out → "Logga in"; signed in → "Mina bussresor", "Mina medlemskap", "Profil", "Logga ut" (only when `ENABLE_LOGIN`; admin links unchanged).
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `Prefill forms for signed-in users and link emails to the account`.

### Task 10: Docs and rollout runbook

**Files:**
- Modify: `AGENTS.md` (Auth row → Better Auth; procedures; remove NextAuth mentions; `scripts/accounts`), `README.md` (env vars), `deploy/README.md` (new section "User accounts rollout")
- Modify: `docs/superpowers/specs/2026-11-22-user-accounts-design.md` (Status: Implemented)

- [ ] **Step 1: Write the runbook** in `deploy/README.md`, in this order:
  1. Back up the database (`deploy/mysql-backup.sh`).
  2. Deploy Tasks 1–3 code with `ENABLE_LOGIN=false`; `prisma db push` (adds `payerEmail`).
  3. `pnpm script scripts/accounts/normalise-emails.ts --dry-run`, resolve collisions by hand, then run for real.
  4. `pnpm script scripts/accounts/backfill-payer-emails.ts`; check counts. Until this has run, old bookings show each link only its own seat.
  5. Check every `role = ADMIN` user has a reachable email.
  6. Deploy Tasks 4–9 with `ENABLE_LOGIN=false`; set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PASSKEY_RP_ID`; remove `NEXTAUTH_*`; `prisma db push --accept-data-loss` (drops `password`, the old NextAuth tables and the `User`–`Membership` join table); `UPDATE User SET emailVerified = 1, name = CONCAT(firstName, ' ', lastName)` for existing rows. Admins sign in again with a code via `/loggain?admin`.
  7. Staging: `ENABLE_LOGIN=true` (a rebuild, since it's `NEXT_PUBLIC_*`), go through sign-up, passkey on iOS Safari + Android Chrome, bookings, memberships, delete account. Then production.
- [ ] **Step 2: Update** `AGENTS.md` and `README.md`. Run `pnpm lint`.
- [ ] **Step 3: Commit** `Document Better Auth and the accounts rollout`.
