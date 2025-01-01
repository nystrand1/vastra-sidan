import { prisma } from "~/server/db";
import { paidPassengerQuery } from "../queryConstants/paidPassengerQuery";

type Event = Awaited<ReturnType<typeof getEvent>>;

export const adminSingleEventFormatter = (event: Event) => {
  // Create a bus lookup map
  const busMap = new Map(event.buses.map((bus) => [bus.id, bus.name]));

  return {
    id: event.id,
    date: event.date,
    title: event.name,
    description: event.description,
    buses: event.buses.map((bus) => ({
      id: bus.id,
      name: bus.name
    })),
    participants: event.buses
      .flatMap((bus) => bus.passengers)
      .map((passenger) => ({
        id: passenger.id,
        bus: busMap.get(passenger.busId ?? ""),
        name: passenger.name,
        email: passenger.email,
        phone: passenger.phone,
        checkedIn: passenger.checkedIn,
        member: passenger.member,
        youth: passenger.youth,
        date: passenger.createdAt
      }))
  };
};

export const getEvent = async (id: string) => {
  const event = await prisma.vastraEvent.findUnique({
    where: {
      id: id
    },
    include: {
      participants: paidPassengerQuery,
      buses: {
        include: {
          passengers: paidPassengerQuery,
        }
      }
    }
  });

  if (!event) {
    throw new Error("Event not found");
  }

  return event;
};
