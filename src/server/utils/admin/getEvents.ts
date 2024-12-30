import { prisma } from "~/server/db"


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
      participants: true,
      buses: {
        include: {
          passengers: true
        }
      }
    },
    orderBy: {
      date: "desc"
    }
  });


  return events;
}