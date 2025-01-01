import { prisma } from "~/server/db";
import { paidPassengerQuery } from "../queryConstants/paidPassengerQuery";


type Event = Awaited<ReturnType<typeof getEvents>>[number];

export const adminEventFormatter = (event: Event) => {
  return {
    id: event.id,
    date: event.date,
    title: event.name,
    participants: event.participants.map(participant => ({
      id: participant.id,
    })),
    buses: event.buses.map(bus => ({
      id: bus.id,
    }))
  }
}

export const getEvents = async () => {
  const events = await prisma.vastraEvent.findMany({
    include: {
      participants: paidPassengerQuery,
      buses: {
        include: {
          passengers: paidPassengerQuery
        }
      }
    },
    orderBy: {
      date: "desc"
    }
  });


  return events;
}