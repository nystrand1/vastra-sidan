import { randomUUID } from "node:crypto";
import {
  Prisma,
  StripePaymentStatus,
  type ParticipantTransfer,
  type PrismaClient
} from "~/generated/prisma/client";
import { TRPCError } from "@trpc/server";
import { type z } from "zod";
import type { ParticipantWithBusAndEvent } from "~/server/api/routers/eventPayment";
import { participantRefundState } from "~/server/utils/refunds";
import { type transferBookingSchema } from "~/utils/zodSchemas";

const notFound = () =>
  new TRPCError({ code: "BAD_REQUEST", message: "Participant not found" });

/**
 * Hands a booked seat to another person: their details replace the traveller's, the note is
 * cleared and the manage token is replaced, so the old link no longer reaches the seat. The bus,
 * price and payment stay as they are. Each transfer is recorded as a `ParticipantTransfer` row.
 *
 * Two transfers of the same seat at once: the second waits for the row lock, then finds the token
 * gone. That re-read must see what the first one committed, so this runs at READ COMMITTED (at the
 * default REPEATABLE READ it would read the snapshot taken by its first query, before the lock).
 */
export const transferBooking = async (
  prisma: PrismaClient,
  { token, firstName, lastName, email, phone }: z.infer<typeof transferBookingSchema>
): Promise<{ participant: ParticipantWithBusAndEvent; transfer: ParticipantTransfer }> =>
  prisma.$transaction(async (tx) => {
    const found = await tx.participant.findFirst({
      where: { cancellationToken: token },
      select: { id: true }
    });
    if (!found) throw notFound();

    await tx.$queryRaw`SELECT id FROM Participant WHERE id = ${found.id} FOR UPDATE`;

    // Re-read by token as well: a transfer that got the lock first has replaced it
    const current = await tx.participant.findFirst({
      where: { id: found.id, cancellationToken: token },
      include: {
        event: true,
        stripePayments: { where: { status: StripePaymentStatus.SUCCEEDED } },
        stripeRefunds: { select: { stripeRefundId: true, status: true } }
      }
    });
    if (!current) throw notFound();

    if (current.stripePayments.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Bokningen är inte betald" });
    }

    const refundState = participantRefundState(current.stripeRefunds);
    if (current.cancellationDate || refundState.refunded || refundState.pending) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Bokningen är avbokad" });
    }

    if (current.event.date <= new Date()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Resan har redan avgått" });
    }

    const name = `${firstName} ${lastName}`;
    const participant = await tx.participant.update({
      where: { id: current.id },
      data: {
        name,
        email,
        phone,
        userEmail: email,
        note: null,
        cancellationToken: randomUUID()
      },
      include: { event: true, bus: true }
    });

    const transfer = await tx.participantTransfer.create({
      data: {
        participantId: current.id,
        previousToken: token,
        fromName: current.name,
        fromEmail: current.email,
        fromPhone: current.phone,
        toName: name,
        toEmail: email,
        toPhone: phone
      }
    });

    return { participant, transfer };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
