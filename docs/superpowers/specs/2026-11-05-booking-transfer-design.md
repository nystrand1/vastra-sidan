# Booking transfer ("Överlåt plats") — design

Date: 2026-11-05
Status: Approved, implemented

## Purpose

A traveller who has booked an away-game trip can't always go. Today their only option is to
cancel (if the trip is refundable and it's more than 36 hours before departure) or to ask the
board to change the booking by hand. People already sell their seats to each other; this feature
lets them hand the booking over to the new person themselves, from the "Hantera bokning" link in
the confirmation email.

The club takes no part in the deal between seller and buyer: the site does not know or care what,
if anything, the buyer paid.

## Decisions

| Question | Decision |
| --- | --- |
| Refund after a transfer | A transferred seat can't be cancelled or refunded on the site. The new holder contacts info@vastrasidan.se. This is stated clearly when transferring and in the emails. |
| Member / youth price | Not enforced in code. The seller and the new holder are told that the seat was bought at member/youth price, and that the bus stewards may check this. |
| Cut-off | A seat can be transferred until departure (`VastraEvent.date`). |
| Who can transfer | Anyone who can manage the traveller today: the traveller and the rest of their group booking (including the person who paid). Once a seat is transferred, the group loses control of it. |
| Onward transfers | Allowed, any number of times. |
| Resale price | None of the club's business. Not recorded. |
| Note ("Övrigt") | Cleared on transfer, as it described the previous holder. |

## Background: how bookings work today

- Each `Participant` has a `cancellationToken`. The confirmation email links to
  `/bortaresor/avboka?token=<cancellationToken>`.
- `eventPayment.getManagableBooking` looks up the participant by token and returns **every
  participant on the same succeeded `StripePayment`**, including their tokens. So everyone in a
  group booking can cancel or change bus for the others.
- Refunds (`eventPayment.cancelBooking`) always go to the card on the original PaymentIntent, i.e.
  whoever paid for the group. Stripe can't refund anyone else.
- Prices depend on `member` / `youth`; what was paid is stored in `Participant.payAmount`.

## Data model

New model in `prisma/schema.prisma`:

```prisma
model ParticipantTransfer {
  id            String      @id @default(cuid())
  createdAt     DateTime    @default(now())
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  previousToken String
  fromName      String
  fromEmail     String
  fromPhone     String
  toName        String
  toEmail       String
  toPhone       String

  @@index([participantId])
  @@index([previousToken])
}
```

and on `Participant`:

```prisma
  cancellationToken String?               @unique @default(uuid())
  transfers         ParticipantTransfer[]
```

`cancellationToken` becomes `@unique` (it had no index). Every manage-page load, cancellation,
bus change and refund-status check looks travellers up by it, and the transfer relies on a token
pointing to exactly one traveller. `NULL` stays allowed for several rows.

**Deployment:** the new code reads `transfers` in `getBooking`, `getManagableBooking`,
`cancelBooking` and the admin participant page, so it breaks (including the thank-you page right
after payment) if it runs before the schema is in place. For each environment's database
(staging, production), in this order:

1. Check for duplicate tokens; this must return no rows:

   ```sql
   SELECT cancellationToken, COUNT(*) FROM Participant
   WHERE cancellationToken IS NOT NULL
   GROUP BY cancellationToken HAVING COUNT(*) > 1;
   ```

2. Run `pnpm prisma db push` against that database, interactively: it warns about adding the
   unique constraint and asks for confirmation. It fails if step 1 found duplicates.
3. Only then merge and deploy the code.

A participant **is transferred** if it has at least one `ParticipantTransfer` row. There is no
separate flag. Rows are append-only; an onward transfer adds another row.

`previousToken` is the `cancellationToken` the participant had before that transfer. It lets the
old link show a message (see "`eventPayment.getManagableBooking` (changed)" below) and is never accepted for managing the seat.

## Server

### `eventPayment.transferBooking` (new, `publicProcedure`)

Input (Zod, new `transferBookingSchema` in `src/utils/zodSchemas.ts`):

```ts
{
  token: string;          // the manage token used to reach this traveller
  firstName: string;      // same messages as participantSchema
  lastName: string;
  email: string;          // .email()
  phone: string;
  consent: true;          // "Jag förstår att platsen inte kan avbokas …"
}
```

`token` is the traveller's current `cancellationToken`. The page already has it for every
traveller it lists, the same way `cancelBooking` and `changeBus` work today.

Steps, in one `prisma.$transaction`:

1. Find the participant's id by `cancellationToken`, lock that row
   (`SELECT id FROM Participant WHERE id = ? FOR UPDATE`), then re-read it by id **and** token.
   (Re-reading by token after taking the lock is what makes a second, simultaneous transfer fail.
   The transaction runs at READ COMMITTED: at MariaDB's default REPEATABLE READ the re-read would
   still see the snapshot from step 1, and both transfers would succeed.)
   Not found at either point → `BAD_REQUEST "Participant not found"`.
2. Load it with its event, succeeded payments and refund rows. Reject with `BAD_REQUEST` and a
   Swedish message if:
   - it has no `SUCCEEDED` `StripePayment` ("Bokningen är inte betald");
   - it is cancelled (`cancellationDate` set) or `participantRefundState` says refunded or
     pending ("Bokningen är avbokad");
   - the event has departed (`event.date <= now`) ("Resan har redan avgått").
3. Update the participant:
   - `name = "${firstName} ${lastName}"`, `email`, `phone`, `userEmail = email`;
   - `note = null`;
   - `cancellationToken = crypto.randomUUID()`.

   `busId`, `payAmount`, `member`, `youth`, `checkedIn` and all payment/refund relations are left
   unchanged. `userEmail` is updated so the seat follows the new holder if user login
   ("Mina bussresor", behind `ENABLE_LOGIN`, currently off) is turned on later; nothing in this
   feature depends on it.
4. Create the `ParticipantTransfer` row with the previous and new details and `previousToken`.

Because the row is locked and the token is replaced, two simultaneous transfers with the same
token can't both succeed: the second finds no participant with that token.

After the transaction commits, send both emails (best effort: failures go to Sentry, the transfer
stands). Return `{ ok: true }`. The new token is **not** returned to the caller; the new holder
gets it only by email.

### Several seats to the same person

Supported with no extra logic: each transfer is independent, and nothing requires a name or
email to be unique per trip. Transferring two seats to the same email gives two seats, two emails
and two separate manage links, each showing only its own seat. Transferred seats are **not**
grouped by email: only a link grants access to a seat, never an email address.

To keep the passenger list useful for the bus stewards, the form asks for the name of the person
who will travel (see "Pages").

### `eventPayment.cancelBooking` (changed)

After loading the participant, if it has any `transfers`, reject with `BAD_REQUEST`:
"Platsen har överlåtits och kan inte avbokas. Kontakta info@vastrasidan.se". This check comes
before any refund logic, so the existing refund code is otherwise unchanged.

### `eventPayment.getManagableBooking` (changed)

1. Look up the participant by `cancellationToken`.
   - **Found and transferred** → return only that participant (the new holder manages it alone).
   - **Found and not transferred** → as today, but leave out participants on the payment that
     are transferred.
2. **Not found** → look up a `ParticipantTransfer` by `previousToken` (the old link of a seat that
   has since been transferred). If none exists, `BAD_REQUEST "Participant not found"` as today.
   If one exists, return `transferredAway: true` and:
   - if it is the participant's **first** transfer (the token belonged to the original group),
     the group view for that participant's payment, leaving out all transferred participants. The
     list may be empty;
   - otherwise (the token belonged to an earlier new holder, who was never part of the group) an
     empty list. That person must not see or manage the original group.

`participantFormatter` gets new fields `transferred: boolean` and `departed: boolean`
(`event.date <= now`; the page hides "Överlåt plats" once the trip has departed).

### `eventPayment.changeBus`

Unchanged. Works by the current token, so the new holder can change bus and the old token no
longer reaches the seat.

### `getBooking` (thank-you page, changed)

It's a public procedure keyed only by the Stripe PaymentIntent id, which stays in the payer's
browser history (`/bortaresor/tack?payment_intent=…`). So that it can't be used to reach a seat
after a transfer:

- it returns no `cancellationToken` for anyone (the page doesn't need it);
- it leaves out transferred participants entirely;
- the event name, departure time, game info and `refundable` come from the payment's event, so
  when every seat has been transferred it returns an empty `participants` list rather than an
  error, and the page says the seats have been transferred.

## Emails

### To the new holder: reuse `EventSignUp`

Add an optional `transferred?: boolean` prop to `src/components/emails/EventSignUp.tsx`. When set:

- the heading reads "Platsen har överlåtits till dig" instead of "Tack för anmälan";
- below the booking details, a notice: the seat can't be cancelled through the site, contact
  info@vastrasidan.se; and, if `member` or `youth` is set, that the seat was bought at member/youth
  price and the bus stewards ("bussvärdarna") may check that the traveller qualifies;
- the "Hantera bokning" button links to `CANCELLATION_URL?token=<new cancellationToken>`, exactly
  as today.

`sendEventConfirmationEmail` gets an optional `{ transferred }` option and passes it on, with
subject "Plats överlåten: <event name>". Because the notice depends on whether the participant has
`transfers`, the admin "send confirmation email" button (`admin.sendParticipantEmail`) also includes
it when resending to a transferred participant.

### To the previous holder: new `BookingTransferred` template

New `src/components/emails/BookingTransferred.tsx`, sent to `fromEmail` with subject
"Du har överlåtit din plats: <event name>". Content: event, date, the new holder's name; that the
booking now belongs to them, that the previous holder can no longer manage it, and that no
refund will be made.

## Pages

### `src/pages/bortaresor/avboka.tsx`

For each listed traveller who isn't cancelled, isn't pending a refund, and whose trip hasn't
departed:

- An **"Överlåt plats"** button opens a form (new component
  `src/components/common/TransferBookingForm`, react-hook-form + `transferBookingSchema`) with
  first name, last name, email and phone, and a consent checkbox. The name fields have the hint
  "Ange namnet på personen som ska åka". Above the fields, a warning:
  - Platsen kan inte avbokas eller återbetalas efter överlåtelsen. Vid frågor, kontakta
    info@vastrasidan.se.
  - Du förlorar tillgången till bokningen. Den nya resenären får en egen länk via mejl.
  - (if `member` or `youth`) Platsen är köpt till medlems-/ungdomspris. Den nya resenären måste
    uppfylla villkoren, och bussvärdarna kan kontrollera det.
- On success: toast "Platsen har överlåtits", then refetch. The traveller disappears from the list.
  If the page's own token belonged to that traveller, the refetch goes through the
  `previousToken` path and shows the "transferred away" message.

For a **transferred** traveller (the new holder's view): hide "Avboka" and show "Överlåten plats.
Den kan inte avbokas, kontakta info@vastrasidan.se". Bus change and "Överlåt plats" stay available.

When `transferredAway` is set: show "Den här platsen har överlåtits till en annan person" above any
remaining travellers in the group.

For a refundable trip, the header's cancellation and refund terms ("Avbokning kan endast ske …",
"Du blir återbetald …") are hidden when every listed traveller is transferred (including an empty
list), since none of those seats can be cancelled. They stay visible on an old link that still
lists untransferred travellers, who can still cancel.

The "Avboka" and "Överlåt plats" buttons (and the transfer form's submit button) are disabled
while any mutation on the page is in flight (a transfer, a bus change, a cancellation) and for the
whole cancellation flow, including the refund status polling. That stops the same page from
cancelling and transferring a seat at once; it doesn't cover two tabs or devices (see "Known
limitation").

"Avboka" and "Överlåt plats" sit side by side in equal columns to keep the page short; when only
one of them is shown it takes the full width. The card has a top margin so it doesn't sit against
the fixed navigation bar.

`ParticipantInfo` needs the traveller's `member` and `youth` flags. Add them to
`participantFormatter`'s output.

### Admin: `src/pages/admin/events/[id]/[participant].tsx`

Show the transfer history (date, from → to name and email), newest first. `getEventParticipantById`
includes `transfers`, and `formatEventParticipant` returns them. Read-only.

## Unchanged and out of scope

- Payments, refunds and the Stripe webhook. A refund the board makes from the Stripe dashboard for
  a transferred seat goes to the original card and is recorded by the existing
  `recordDashboardRefund` path.
- Seat counts: the participant row and its payment are the same, so seats taken don't change.
- Today's rule that everyone in a group can manage the whole group (apart from transferred seats).

## Known limitation

`cancelBooking` calls Stripe outside a database transaction. If a cancellation and a transfer of
the same seat overlap (within the time the Stripe refund call takes, typically about a second),
both can succeed: the refund goes to the original card and the new holder's seat is cancelled. Exploiting this needs the seller to do it deliberately at the same moment.
Accepted for now; closing it would mean reworking `cancelBooking`'s locking.

## Tests

New `test/events/transfer.test.ts`, using `publicCaller()`, the factories, `fakeStripe` and the SES
mock:

- transferring updates name, email, phone and `userEmail`, clears the note, keeps bus and
  `payAmount`, replaces the token and records a `ParticipantTransfer`;
- the old token can't cancel, change bus or transfer; `getManagableBooking` with it returns
  `transferredAway` and the rest of the group;
- the new holder's view lists only their seat with `transferred: true`;
- a transferred seat can't be cancelled (and no refund is sent to Stripe), but its bus can be
  changed;
- the group view no longer lists the transferred seat;
- an onward transfer works and adds a second `ParticipantTransfer` row; the intermediate holder's
  old token returns `transferredAway` with an empty list, not the original group;
- two seats from the same group transferred, one at a time, to the same email: each gets its own
  token and email, each token's view lists only its own seat, and the rest of the group no longer
  lists either;
- a transfer works within 36 hours of departure, and is rejected after departure;
- `getManagableBooking` reports `departed` once the trip has left;
- a transfer without consent is rejected;
- the group's old link still shows the rest of the group after an onward transfer;
- `getBooking` returns no manage tokens and leaves out transferred seats, and returns an empty
  list when every seat has been transferred;
- a transfer is rejected for a cancelled seat, a seat with a pending refund, and an unpaid seat;
- two simultaneous transfers with the same token: exactly one succeeds;
- emails: the new holder gets a confirmation with the new token's link and the "can't be
  cancelled" notice (plus the member/youth notice when relevant); the previous holder gets the
  receipt.
