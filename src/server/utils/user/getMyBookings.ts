import { type PrismaClient, StripePaymentStatus } from "~/generated/prisma/client";
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

/**
 * The signed-in user's paid trips, upcoming (soonest first) and past (latest first).
 * A seat is listed when its current holder is the user, when the user paid for its booking, or
 * when the user transferred it away. Matching is on plain emails (stored lowercased; `email` is
 * already normalised).
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
        { stripePayments: { some: { ...succeeded, payerEmail: email } } },
        { transfers: { some: { fromEmail: email } } }
      ]
    },
    include: {
      ...formattedParticipantInclude,
      event: { include: busesWithBookedSeats() },
      transfers: { select: { id: true } },
      stripePayments: { where: succeeded, select: { payerEmail: true } }
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const now = new Date();
  const byEvent = new Map<string, MyTrip>();

  for (const participant of participants) {
    const { event } = participant;
    const iPaid = isPayer(email, participant.stripePayments[0]?.payerEmail ?? null);
    const isOwn = participant.email === email;
    const hasTransfers = participant.transfers.length > 0;
    const isPast = event.date < now;
    // The token is the capability: only for a seat still with the user or, as payer, the group
    const canManage = !isPast && (isOwn || (iPaid && !hasTransfers));

    const seat: MySeat = {
      ...participantFormatter(participant),
      isOwn,
      transferredAway: hasTransfers && !isOwn,
      cancellationToken: canManage ? participant.cancellationToken : null
    };

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
    trip.seats.push(seat);
  }

  const trips = [...byEvent.values()];
  return {
    upcoming: trips
      .filter((t) => t.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime()),
    past: trips.filter((t) => t.date < now).sort((a, b) => b.date.getTime() - a.date.getTime())
  };
};
