import { prisma } from "~/server/db";
import { paidPassengerQuery } from "../queryConstants/paidPassengerQuery";
import { busesWithBookedSeats } from "~/server/utils/busCapacity";

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
    note: participant.note,
    transfers: participant.transfers.map((transfer) => ({
      createdAt: transfer.createdAt,
      fromName: transfer.fromName,
      fromEmail: transfer.fromEmail,
      toName: transfer.toName,
      toEmail: transfer.toEmail
    }))
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
        include: busesWithBookedSeats()
      },
      transfers: { orderBy: { createdAt: "desc" } }
    }
  });
  return participant;
};
