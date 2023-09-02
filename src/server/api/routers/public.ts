import { SwishPaymentStatus, SwishRefundStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { subDays, subHours } from "date-fns";
import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

const busesWithPaidPassengers = {
  buses: {
    include: {
      _count: {
        select: {
          passengers: {
            where: {
              swishPayments: {
                some: {
                  status: SwishPaymentStatus.PAID,
                }
              },
              swishRefunds: {
                none: {
                  status: SwishRefundStatus.PAID,
                }
              }
            }
          }
        }
      }
    }
  }
}

export const publicRouter = createTRPCRouter({
  getAwayGames: publicProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: busesWithPaidPassengers,
      where: {
        date: {
          gte: subHours(new Date(), 8)
        }
      }
    });
    const eventWithParticiantCount = res.map(event => ({
      ...event,
      maxSeats: event.buses.reduce((acc, bus) => acc + bus.seats, 0),
      bookedSeats: event.buses.reduce((acc, bus) => acc + bus._count.passengers, 0),
    }));

    return eventWithParticiantCount;
  }),
  getAwayGame: publicProcedure
    .input(z.object({id: z.string()}))
    .query(async ({ ctx, input }) => {
      const res = await ctx.prisma.vastraEvent.findUnique({
        where: {
          id: input.id
        },
        include: busesWithPaidPassengers
      });

      if (!res) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return res;
    })
});
