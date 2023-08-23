import { SwishPaymentStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";

export const publicRouter = createTRPCRouter({
  getAwayGames: publicProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      where: {
        participants: {
          every: {
            swishPayments: {
              some: {
                status: SwishPaymentStatus.PAID,
              }
            }
          }
        }
      },
      include: {
        buses: {
          include: {
            passengers: {
              select: {
                id: true
              },
              where: {
                swishPayments: {
                  some: {
                    status: SwishPaymentStatus.PAID,
                  }
                }
              }
            }
          }
        }
      }
    });
    const eventWithParticiantCount = res.map(event => ({
      ...event,
      maxSeats: event.buses.reduce((acc, bus) => acc + bus.seats, 0),
      bookedSeats: event.buses.reduce((acc, bus) => acc + bus.passengers.length, 0),
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
        include: {
          buses: {
            include: {
              _count: {
                select: {
                  passengers: true,
                }
              }
            }
          }
        }
      });

      if (!res) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return res;
    })
});
