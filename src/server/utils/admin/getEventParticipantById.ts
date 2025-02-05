import { prisma } from "~/server/db";
import { paidPassengerQuery } from "../queryConstants/paidPassengerQuery";


export const formatEventParticipant = (participant: NonNullable<Awaited<ReturnType<typeof getEventParticipantById>>>) => {
  return {
    id: participant.id,
    name: participant.name,
    email: participant.email,
    phone: participant.phone,
    event: participant.event,
    member: participant.member,
    youth: participant.youth,
    createdAt: participant.createdAt,
  };
};

export const getEventParticipantById = async (id: string) => {
  const participant = await prisma.participant.findUnique({
    where: { 
      id,
      ...paidPassengerQuery.where
     },
    include: {
      event: true,
    },
  });
  return participant;
};
