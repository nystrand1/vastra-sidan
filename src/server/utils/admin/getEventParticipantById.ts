import { prisma } from "~/server/db";
import { paidPassengerQuery } from "../queryConstants/paidPassengerQuery";
import { busesWithPaidPassengers } from "~/server/api/routers/public";

export const formatEventParticipant = (
  participant: NonNullable<Awaited<ReturnType<typeof getEventParticipantById>>>
) => {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    phone: participant.phone,
    event: {
      ...participant.event,
      buses: participant.event.buses.map((bus) => ({
        ...bus,
        availableSeats: bus.seats - bus._count.passengers
      }))
    },
    member: participant.member,
    youth: participant.youth,
    createdAt: participant.createdAt,
    bus: participant.bus,
    note: participant.note
  };
};

export const getEventParticipantById = async (id: string) => {
  const participant = await prisma.participant.findUnique({
    where: {
      id,
      ...paidPassengerQuery.where
    },
    include: {
      bus: true,
      event: {
        include: busesWithPaidPassengers
      }
    }
  });
  return participant;
};
