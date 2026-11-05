# Booking Transfer ("Överlåt plats") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a traveller hand their away-game seat over to another person from the "Hantera bokning" page, without touching payments or refunds.

**Architecture:** A transfer updates the existing `Participant` in place (new name/email/phone, cleared note, new `cancellationToken`) and appends a `ParticipantTransfer` row. A seat is "transferred" iff it has such a row. `cancelBooking` refuses transferred seats; `getManagableBooking` hides them from the group and shows them only via their own token. Two emails go out after the transaction commits.

**Tech Stack:** Next.js 15 (Pages Router), tRPC v11, Prisma 7 (MySQL/MariaDB, `relationMode = "prisma"`), Zod, react-hook-form, React Email + SES, Vitest + Testcontainers + MSW.

**Spec:** `docs/superpowers/specs/2026-11-05-booking-transfer-design.md`. Read it before starting any task.

## Global Constraints

- Base branch is `staging`. Work on `ccr-d023aaab-hyvwpo`.
- Imports use `~/`. Server code imports Prisma from `~/generated/prisma/client`; anything a page or component imports uses `~/generated/prisma/browser`.
- All user-facing copy is Swedish. Contact address: `info@vastrasidan.se`. Bus stewards are "bussvärdarna".
- Do not change the refund calculation, the Stripe webhook, or seat counting. The only refund-path change is the transferred-seat guard in `cancelBooking`.
- Transfers are allowed until departure (`event.date > now`); the 36-hour cancellation rule does not apply.
- Member/youth eligibility is not enforced, only stated.
- Transferred seats are never grouped by email: only a token gives access.
- After a schema change, `pnpm prisma generate`. Tests push the schema themselves (`test/setup/globalSetup.ts`).
- `Participant.cancellationToken` becomes `@unique`. Deploying needs the duplicate-token check from the spec's "Data model" section before `prisma db push`; put it in the PR description.
- Tests follow `AGENTS.md`: callers from `test/helpers/caller.ts`, data from `test/helpers/factories.ts` / `test/helpers/flows.ts`, Stripe via `fakeStripe`, emails via `getSentEmails()` from `test/mocks/ses.ts`, DB assertions via `prisma` from `test/helpers/db.ts`.
- Checks for every task: `pnpm test test/events`, `pnpm lint`, `pnpm exec tsc --noEmit`.

## Review Focus

1. **The email fails to send (SES error).** The transfer must still stand and the mutation must succeed. Failures go to Sentry. Test in Task 3.
2. **A group member transfers another traveller's seat** (the payer using their own link). This must work, and the payer must lose that seat afterwards. Test in Task 1.
3. **A free admin booking (`admin-comp-…`, amount 0).** It can be transferred like any paid booking. Test in Task 1.
4. **Stray whitespace in the form ("  Kalle ").** Names and email are trimmed before saving, or the bussvärdar see odd names. Test in Task 1.
5. **The old link of a seat transferred from a one-person booking.** `getManagableBooking` returns `transferredAway: true` with an empty list, and the page must render the message rather than nothing or a crash. API test in Task 2, page check in Task 4.

---

### Task 1: Data model and the `transferBooking` mutation

**Files:**
- Modify: `prisma/schema.prisma` (new `ParticipantTransfer` model exactly as in the spec's "Data model" section; on `Participant`, add `transfers ParticipantTransfer[]` and make `cancellationToken` `@unique`)
- Modify: `src/utils/zodSchemas.ts`
- Create: `src/server/utils/transferBooking.ts`
- Modify: `src/server/api/routers/eventPayment.ts` (add `transferBooking` procedure)
- Test: `test/events/transfer.test.ts` (new)

**Interfaces:**
- Produces (zodSchemas):
  - `transferBookingFormSchema = z.object({ firstName, lastName, email, phone, consent })`. `firstName`, `lastName` and `phone` use the same messages as `participantSchema` plus `.trim()`. `email` is `.trim().toLowerCase().email(...)`. `consent` is a boolean with `.refine(x => x, { message: "Du måste bekräfta att du förstår villkoren" })`.
  - `transferBookingSchema = transferBookingFormSchema.extend({ token: z.string() })`.
- Produces (`~/server/utils/transferBooking`): `transferBooking(prisma: PrismaClient, input: z.infer<typeof transferBookingSchema>): Promise<{ participant: ParticipantWithBusAndEvent; transfer: ParticipantTransfer }>`. `participant` is the updated row with `event` and `bus` included.
- Produces (router): `eventPayment.transferBooking` (`publicProcedure`, input `transferBookingSchema`). It returns `{ ok: true }` and never returns the new token. Task 3 adds the emails here.

- [ ] **Step 1: Write the failing tests** in `test/events/transfer.test.ts`

Helpers at the top of the file:

```ts
const buyer = (overrides = {}) => ({
  firstName: "Kalle", lastName: "Köpare", email: "kalle@test.se", phone: "0701112233", consent: true, ...overrides
});
const transfer = (token: string | null, to = buyer()) =>
  publicCaller().eventPayment.transferBooking({ token: token ?? "", ...to });
const reload = (id: string) => prisma.participant.findUniqueOrThrow({ where: { id } });
```

Inside `describe("transferring a booking", …)`:

- `it("hands the seat to the new person and replaces the manage token")`: book one traveller with `participantInput(busId, { note: "Glutenfri", member: true })` via `bookAndPay`, then `transfer(p.cancellationToken)`. Assert:
  - the reloaded row has `name: "Kalle Köpare"`, `email`/`userEmail: "kalle@test.se"`, `phone: "0701112233"` and `note: null`;
  - `busId`, `payAmount` and `member: true` are unchanged;
  - `cancellationToken` is a non-empty string different from the old one;
  - exactly one `ParticipantTransfer` row exists, with `previousToken` = the old token, `fromName/fromEmail/fromPhone` = the old values and `toName: "Kalle Köpare"`;
  - `fakeStripe.requestsTo("POST", "/refunds")` is empty;
  - `availableSeats` is unchanged.
- `it("trims names and email")`: transfer to `buyer({ firstName: "  Kalle ", lastName: " Köpare ", email: " Kalle@Test.se " })`. Assert `name === "Kalle Köpare"` and `email === "kalle@test.se"`.
- `it("lets someone in the group transfer another traveller's seat")`: book two travellers `a` and `b`. Call `transfer(b.cancellationToken)`, which is the token a's page holds for b. Assert b is updated and a is untouched. Task 2 tests what the group sees afterwards.
- `it("transfers a free admin booking")`: `adminCaller().admin.addParticipant(...)`, then find it by email and transfer it. Assert one `ParticipantTransfer` row.
- `it("allows a transfer within 36 hours of departure")`: `createEvent({ departure: addHours(new Date(), 2) })`, then book and transfer. Assert it resolves.
- `it("rejects a transfer after departure")`: book, then `prisma.vastraEvent.update({ data: { date: subMinutes(new Date(), 1) } })`. Expect a rejection with `"Resan har redan avgått"`.
- `it("rejects a cancelled seat")`: cancel, then `fakeStripe.completeRefund(...)`, then transfer. Rejects with `"Bokningen är avbokad"`.
- `it("rejects a seat with a pending refund")`: cancel without completing, then transfer. Rejects with `"Bokningen är avbokad"`.
- `it("rejects an unpaid booking")`: `book(...)` (from flows) without paying, then transfer that participant's token. Rejects with `"Bokningen är inte betald"`.
- `it("rejects an unknown token")`: rejects with `"Participant not found"`.
- `it("never gives two travellers the same manage token")`: setting a second participant's `cancellationToken` to an existing one with `prisma.participant.update` rejects, with Prisma error code `P2002`.
- `it("lets only one of two simultaneous transfers through")`: `Promise.allSettled([transfer(t, buyer()), transfer(t, buyer({ email: "other@test.se" }))])`. Assert exactly one is fulfilled, the other is rejected with `"Participant not found"`, and `prisma.participantTransfer.count() === 1`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm prisma generate && pnpm test test/events/transfer.test.ts`
Expected: FAIL. `transferBooking` doesn't exist on the router (a TS/runtime error).

- [ ] **Step 3: Add the schema model, the Zod schemas, `transferBooking()` and the procedure**

`transferBooking()` runs in `prisma.$transaction`:
1. `findFirst({ where: { cancellationToken: token }, select: { id: true } })`.
2. `` tx.$queryRaw`SELECT id FROM Participant WHERE id = ${id} FOR UPDATE` ``.
3. Re-read with `where: { id, cancellationToken: token }`, including `event`, `stripePayments: { where: { status: SUCCEEDED } }` and `stripeRefunds: { select: { stripeRefundId, status } }`.

Throw `TRPCError BAD_REQUEST` with these messages, in this order:
- `"Participant not found"` if step 1 or step 3 finds nothing;
- `"Bokningen är inte betald"` if there's no succeeded payment;
- `"Bokningen är avbokad"` if `cancellationDate` is set, or `participantRefundState(...)` gives `refunded || pending`;
- `"Resan har redan avgått"` if `event.date <= new Date()`.

Then update the participant (`cancellationToken: randomUUID()` from `node:crypto`) and create the transfer row.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test test/events/transfer.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the rest of the events suite, lint and typecheck**

Run: `pnpm test test/events && pnpm lint && pnpm exec tsc --noEmit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma src/utils/zodSchemas.ts src/server/utils/transferBooking.ts src/server/api/routers/eventPayment.ts test/events/transfer.test.ts
git commit -m "Add transferBooking: hand a booked seat to another person"
```

---

### Task 2: Who sees and controls a transferred seat

**Files:**
- Modify: `src/server/api/routers/eventPayment.ts` (`participantFormatter`, `ParticipantWithParticipants`, `cancelBooking`, `getManagableBooking`)
- Test: `test/events/transfer.test.ts`

**Interfaces:**
- Consumes: `eventPayment.transferBooking` and the `ParticipantTransfer` model from Task 1.
- Produces: `participantFormatter` output gains `transferred: boolean`, `member: boolean` and `youth: boolean`. `getManagableBooking` returns everything it returns today plus `transferredAway: boolean`. Task 4 relies on these names.

- [ ] **Step 1: Write the failing tests** in a new `describe("managing a transferred seat", …)`

Read the new token after a transfer with `(await reload(p.id)).cancellationToken!`.

- `it("shows the new holder only their own seat")`: book `a` and `b`, then transfer `b`. `getManagableBooking({ token: newToken })` lists exactly one participant, `{ email: "kalle@test.se", transferred: true }`, and returns `transferredAway: false`.
- `it("hides a transferred seat from the rest of the group")`: same setup. a's view lists only a.
- `it("shows the group's old link that the seat has been transferred")`: transfer `a` (a is the payer, using their own token). `getManagableBooking({ token: a's old token })` returns `transferredAway: true` and lists only b.
- `it("shows only the message when a one-person booking was transferred")`: one traveller. The old token gives `transferredAway: true` and `participants: []`.
- `it("does not show the original group to an earlier new holder")`: book `a` and `b`. Transfer `b` to Kalle (`t2`), then from `t2` to `buyer({ email: "lisa@test.se" })` (`t3`). Then:
  - `t2` gives `transferredAway: true` and `participants: []`;
  - `t3` lists only Lisa's seat;
  - there are two `ParticipantTransfer` rows.
- `it("gives each seat transferred to the same person its own link")`: book `a`, `b` and `c`, and transfer `b` and `c` (one at a time) to the same `buyer()`. Then:
  - the two new tokens differ;
  - each token's view lists only its own seat;
  - a's view lists only a.
- `it("refuses to cancel a transferred seat, without asking Stripe for a refund")`: on a refundable event, `cancel(newToken)` rejects with `"Platsen har överlåtits och kan inte avbokas. Kontakta info@vastrasidan.se"`, and `fakeStripe.requestsTo("POST", "/refunds")` is empty.
- `it("lets the new holder change bus")`: an event with 2 buses. `changeBus({ token: newToken, busId: bus2 })` gives `busId === bus2`.
- `it("stops the old token from managing the seat")`: `cancel(oldToken)` and `changeBus({ token: oldToken, … })` both reject with `"Participant not found"`, and `transfer(oldToken)` rejects with `"Participant not found"`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm test test/events/transfer.test.ts`
Expected: FAIL on the new view and cancel assertions.

- [ ] **Step 3: Implement**

- `cancelBooking`: include `transfers: { select: { id: true } }`. If `transfers.length > 0`, throw the message above, right after the "Participant not found" check.
- `participantFormatter`: add `transferred: participant.transfers.length > 0`, plus `member` and `youth`. Include `transfers: { select: { id: true } }` wherever the formatter's input is loaded, including `getBooking`.
- `getManagableBooking`: follow the spec's three cases. When listing a payment's participants for the group, filter out every participant whose `transfers` is non-empty. To decide whether a `previousToken` match is the participant's first transfer, take the `ParticipantTransfer` for that participant with the earliest `createdAt` (ties broken by `id`) and compare ids.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test test/events && pnpm lint && pnpm exec tsc --noEmit`
Expected: all pass, including the existing cancellation and change-bus tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/routers/eventPayment.ts test/events/transfer.test.ts
git commit -m "Hide transferred seats from the group and block cancelling them"
```

---

### Task 3: Emails

**Files:**
- Modify: `src/components/emails/EventSignUp.tsx`
- Create: `src/components/emails/BookingTransferred.tsx`
- Modify: `src/server/utils/email/sendEventConfirmationEmail.ts`
- Create: `src/server/utils/email/sendBookingTransferredEmail.ts`
- Modify: `src/server/api/routers/eventPayment.ts` (`transferBooking` sends the emails)
- Modify: `src/server/utils/admin/getEventParticipantById.ts` (include `transfers`), `src/server/api/routers/admin.ts` (`sendParticipantEmail`)
- Test: `test/events/transfer.test.ts`

**Interfaces:**
- Consumes: the return value of `transferBooking()` from Task 1.
- Produces:
  - `sendEventConfirmationEmail(participant: ParticipantWithBusAndEvent, options?: { transferred?: boolean })`;
  - `sendBookingTransferredEmail({ transfer: ParticipantTransfer, event: VastraEvent })`;
  - `EventSignUp` prop `transferred?: boolean`;
  - `getEventParticipantById` includes `transfers: { orderBy: { createdAt: "desc" } }`, which Task 5 reads.

- [ ] **Step 1: Write the failing tests** in `describe("transfer emails", …)`. Call `resetSentEmails()` after booking.

- `it("sends the new holder a confirmation with their own manage link")`: after the transfer, `getSentEmails()` contains:
  - an email `to: "kalle@test.se"` with `subject: "Plats överlåten: <event.name>"`, whose html contains `token=${newToken}` and `info@vastrasidan.se`, and does **not** contain `"medlems-/ungdomspris"` (the traveller was a non-member adult);
  - an email `to: <old email>` with `subject: "Du har överlåtit din plats: <event.name>"`, whose html contains `"Kalle Köpare"`.
- `it("tells the new holder the seat was bought at member or youth price")`: the seat is booked with `member: true`. The new holder's html contains `"medlems-/ungdomspris"`.
- `it("keeps the transfer when the email can't be sent")`: `server.use(http.post("https://email.eu-north-1.amazonaws.com/", () => HttpResponse.error()))`. The transfer resolves, the participant is updated, and `captureException` was called.
- `it("resends the transfer notice from admin")`: after the transfer, `resetSentEmails()`, then `adminCaller().admin.sendParticipantEmail({ id })`. The single email's html contains `token=${newToken}` and `info@vastrasidan.se`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm test test/events/transfer.test.ts`
Expected: FAIL. No emails are sent.

- [ ] **Step 3: Implement**

`EventSignUp`, when `transferred` is set:
- Heading: "Platsen har överlåtits till dig". This replaces "Tack för anmälan".
- After the details: "Platsen kan inte avbokas via hemsidan. Kontakta info@vastrasidan.se om du behöver avboka."
- Only if `participant.member || participant.youth`: "Platsen är köpt till medlems-/ungdomspris. Du måste uppfylla villkoren för det, och bussvärdarna kan kontrollera det."
- The button and link stay as they are today.

`BookingTransferred` (props `transfer`, `event`; same layout as `EventSignUp`, with no button):
- Heading: "Du har överlåtit din plats".
- Body: "Din plats på {event.name} ({yyyy-MM-dd}) tillhör nu {toName}. Du kan inte längre hantera bokningen och ingen återbetalning görs. Vid frågor, kontakta info@vastrasidan.se."
- Give it mock default props so `pnpm dev:email` previews it.

Router: after `transferBooking()`, send both emails with `Promise.allSettled([...])` and `captureException` each rejection, the same pattern as the `payment_intent.succeeded` branch in `src/app/api/payment/stripeWebhook/route.ts`.

Admin: `sendParticipantEmail` passes `{ transferred: participant.transfers.length > 0 }`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test test/events && pnpm lint && pnpm exec tsc --noEmit`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/emails src/server/utils/email src/server/api/routers/eventPayment.ts src/server/api/routers/admin.ts src/server/utils/admin/getEventParticipantById.ts test/events/transfer.test.ts
git commit -m "Email the new and previous holder when a seat is transferred"
```

---

### Task 4: "Överlåt plats" on the manage page

**Files:**
- Create: `src/components/common/TransferBookingForm/TransferBookingForm.tsx`
- Modify: `src/pages/bortaresor/avboka.tsx`

**Interfaces:**
- Consumes:
  - `transferBookingFormSchema` (Task 1) and `eventPayment.transferBooking`;
  - from `getManagableBooking` (Task 2): `participants[].transferred`, `member`, `youth` and `transferredAway`.
- Produces: `<TransferBookingForm token={string} boughtAtReducedPrice={boolean} onTransferred={() => Promise<void>} />`.

There are no component tests in this repo, so this task is verified with lint, typecheck, build and a manual run.

- [ ] **Step 1: Build `TransferBookingForm`**

- Use react-hook-form with `zodResolver(transferBookingFormSchema)`, and the `Form`/`FormField`/`Input` components from `~/components/ui` (see `src/pages/admin/events/[id]/[participant].tsx` for the pattern).
- Fields: Förnamn, Efternamn, Email, Telefon. Under the name fields, the hint "Ange namnet på personen som ska åka". Then a consent checkbox labelled "Jag förstår att platsen inte kan avbokas efter överlåtelsen".
- Above the fields, a bordered warning box, styled like `NonRefundableNotice`, with these lines:
  1. "Platsen kan inte avbokas eller återbetalas efter överlåtelsen. Vid frågor, kontakta info@vastrasidan.se."
  2. "Du förlorar tillgången till bokningen. Den nya resenären får en egen länk via mejl."
  3. Only when `boughtAtReducedPrice`: "Platsen är köpt till medlems-/ungdomspris. Den nya resenären måste uppfylla villkoren, och bussvärdarna kan kontrollera det."
- On submit:
  - show `toast.loading("Överlåter plats...")`;
  - on success, show `toast.success("Platsen har överlåtits")` and call `onTransferred()`;
  - if the error is a `BAD_REQUEST`, show its message; any other error goes to `captureException` with the toast "Något gick fel, kontakta styrelsen". This is the same handling as `handleCancel`.
- Wrap the form in `DialogDrawer`, opened by a full-width "Överlåt plats" button.

- [ ] **Step 2: Wire it into `avboka.tsx`**

In `ParticipantInfo`:
- Render `TransferBookingForm` when `!hasCancelled && !refundPending`. Pass `boughtAtReducedPrice={member || youth}` and `onTransferred={refetch}`. Departed trips are rejected by the server, so no client-side departure check is needed.
- When `transferred`, hide "Avboka" and show "Överlåten plats. Den kan inte avbokas, kontakta info@vastrasidan.se", styled like the other status boxes.

In `CancelPage`:
- When `data.transferredAway`, render "Den här platsen har överlåtits till en annan person" above the list.
- An empty `participants` list must render that message with no errors.

- [ ] **Step 3: Lint, typecheck and build**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: all succeed. The build fails if a page imports `~/generated/prisma/client`.

- [ ] **Step 4: Manual check**

Run: `docker compose up -d && pnpm prisma db push && pnpm dev`. Book a trip with two travellers using Stripe test mode, open the manage link from the email (or copy the token from Prisma Studio), and check:
1. The form shows the warnings.
2. After the transfer, the seat is gone from the group's view.
3. The new token shows the seat with no "Avboka" button.
4. A one-person booking's old link shows only the transferred message.
5. The layout works at 375px wide.

If Docker or Stripe isn't available, say so in the hand-off instead of skipping silently.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/TransferBookingForm src/pages/bortaresor/avboka.tsx
git commit -m "Add Överlåt plats to the manage booking page"
```

---

### Task 5: Transfer history in admin

**Files:**
- Modify: `src/server/utils/admin/getEventParticipantById.ts` (`formatEventParticipant` returns `transfers`)
- Modify: `src/pages/admin/events/[id]/[participant].tsx`
- Test: `test/events/transfer.test.ts`

**Interfaces:**
- Consumes: `getEventParticipantById` including `transfers` (Task 3).
- Produces: `admin.getEventParticipantById` output gains `transfers: { createdAt: Date; fromName: string; fromEmail: string; toName: string; toEmail: string }[]`, newest first.

- [ ] **Step 1: Write the failing test**

`it("shows admins the transfer history, newest first")`: transfer once, then onward. `adminCaller().admin.getEventParticipantById({ id })` returns `transfers` of length 2. `transfers[0]` has `toEmail: "lisa@test.se"` and `transfers[1]` has `fromEmail: <original email>`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test test/events/transfer.test.ts -t "transfer history"`
Expected: FAIL. `transfers` is undefined.

- [ ] **Step 3: Implement**

- Map the fields above in `formatEventParticipant`.
- On the admin page, add a "Överlåtelser" section, shown only when `transfers.length > 0`. List each transfer as `yyyy-MM-dd HH:mm: {fromName} ({fromEmail}) → {toName} ({toEmail})`, using `formatSwedishTime`.

- [ ] **Step 4: Run everything**

Run: `pnpm test && pnpm lint && pnpm exec tsc --noEmit && pnpm build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/utils/admin/getEventParticipantById.ts "src/pages/admin/events/[id]/[participant].tsx" test/events/transfer.test.ts
git commit -m "Show a traveller's transfer history in admin"
```
