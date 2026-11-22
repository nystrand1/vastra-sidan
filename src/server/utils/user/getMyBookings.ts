import { type Prisma, type PrismaClient, StripePaymentStatus } from "~/generated/prisma/client";
import {
  formattedParticipantInclude,
  participantFormatter
} from "~/server/api/routers/eventPayment";
import { isPayer } from "~/server/utils/accounts/bookingAccess";
import { busesWithBookedSeats } from "~/server/utils/busCapacity";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { isTrainEvent } from "~/utils/transport";

export type MySeat = ReturnType<typeof participantFormatter> & {
  /** The seat's current holder is the signed-in user. */
  isOwn: boolean;
  /** The seat has left the user's hands: it was transferred to someone else. Read-only. */
  transferredAway: boolean;
};

export type MyTrip = {
  eventId: string;
  eventName: string;
  date: Date;
  departureTime: string;
  isTrain: boolean;
  refundable: boolean;
  buses: {
    id: string;
    name: string;
    seats: number;
    availableSeats: number;
    _count: { passengers: number };
  }[];
  seats: MySeat[];
};

const succeeded = { status: StripePaymentStatus.SUCCEEDED };

const eventInclude = { include: busesWithBookedSeats() };

type EventWithBuses = Prisma.VastraEventGetPayload<typeof eventInclude>;

/**
 * The signed-in user's paid trips, upcoming (soonest first) and past (latest first).
 * Listed: seats the user holds, seats still with the group on bookings the user paid for, and
 * seats the user transferred away.
 *
 * Never shows data tied to another email. A seat the user gave away is built from the transfer
 * record (the user's own name and email at the time), never from the seat row, which now holds
 * the new holder's data. A seat someone else transferred away is not listed for the payer at all,
 * like on the booking link.
 *
 * A seat's manage token is the capability, so it is only returned for a seat the user may
 * manage on a trip that hasn't left yet: their own seat, or, as payer, any seat still with the
 * group.
 */
export const getMyBookings = async (
  prisma: PrismaClient,
  email: string
): Promise<{ upcoming: MyTrip[]; past: MyTrip[] }> => {
  const participants = await prisma.participant.findMany({
    where: {
      stripePayments: { some: succeeded },
      OR: [
        { email },
        {
          transfers: { none: {} },
          stripePayments: { some: { ...succeeded, payerEmail: email } }
        }
      ]
    },
    include: {
      ...formattedParticipantInclude,
      event: eventInclude,
      stripePayments: { where: succeeded, select: { payerEmail: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  // Seats the user gave away and no longer holds (a seat that came back to them is listed above)
  const transfers = await prisma.participantTransfer.findMany({
    where: {
      fromEmail: email,
      participant: { email: { not: email }, stripePayments: { some: succeeded } }
    },
    select: {
      participantId: true,
      fromName: true,
      fromEmail: true,
      participant: { select: { event: eventInclude } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const now = new Date();
  const byEvent = new Map<string, MyTrip>();

  const tripFor = (event: EventWithBuses) => {
    let trip = byEvent.get(event.id);
    if (!trip) {
      trip = {
        eventId: event.id,
        eventName: event.name,
        date: event.date,
        departureTime: formatSwedishTime(event.date, "HH:mm"),
        isTrain: isTrainEvent(event),
        refundable: event.refundable,
        buses: event.buses.map((bus) => ({
          id: bus.id,
          name: bus.name,
          seats: bus.seats,
          availableSeats: bus.seats - bus._count.passengers,
          _count: { passengers: bus._count.passengers }
        })),
        seats: []
      };
      byEvent.set(event.id, trip);
    }
    return trip;
  };

  for (const participant of participants) {
    const { event } = participant;
    const isOwn = participant.email === email;
    const iPaid = isPayer(email, participant.stripePayments[0]?.payerEmail ?? null);
    // The token is the capability: only for a seat still with the user or, as payer, the group
    const canManage = event.date >= now && (isOwn || (iPaid && participant.transfers.length === 0));
    tripFor(event).seats.push({
      ...participantFormatter(participant),
      isOwn,
      transferredAway: false,
      cancellationToken: canManage ? participant.cancellationToken : null
    });
  }

  const seenSeats = new Set<string>();
  for (const transfer of transfers) {
    if (seenSeats.has(transfer.participantId)) continue;
    seenSeats.add(transfer.participantId);
    const { event } = transfer.participant;
    // Only what the user themselves put on the seat. Everything else about it now belongs to the
    // current holder, so it is left neutral.
    tripFor(event).seats.push({
      name: transfer.fromName,
      email: transfer.fromEmail,
      cancellationToken: null,
      eventName: event.name,
      payAmount: null,
      busId: null,
      departureTime: formatSwedishTime(event.date, "HH:mm"),
      cancellationDate: null,
      note: null,
      cancellationDisabled: true,
      refundable: event.refundable,
      hasCancelled: false,
      refundPending: false,
      member: false,
      youth: false,
      transferred: true,
      transferDisabled: true,
      isOwn: false,
      transferredAway: true
    });
  }

  const trips = [...byEvent.values()];
  return {
    upcoming: trips
      .filter((t) => t.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    past: trips.filter((t) => t.date < now).sort((a, b) => b.date.getTime() - a.date.getTime())
  };
};
