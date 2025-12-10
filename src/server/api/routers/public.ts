import {
  MembershipType,
  StripePaymentStatus,
  StripeRefundStatus
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { subHours } from "date-fns";
import { z } from "zod";
import { createTRPCRouter, membershipProcedure, publicProcedure } from "~/server/api/trpc";
import { toUTCDate } from "~/server/utils/helpers";
import { getStartPage } from "~/server/utils/public/getStartPage";

export const busesWithPaidPassengers = {
  buses: {
    include: {
      _count: {
        select: {
          passengers: {
            where: {
              stripePayments: {
                some: {
                  status: StripePaymentStatus.SUCCEEDED
                }
              },
              stripeRefunds: {
                none: {
                  status: StripeRefundStatus.REFUNDED
                }
              }
            }
          }
        }
      }
    }
  }
};

export const publicRouter = createTRPCRouter({
  getAwayGames: publicProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.vastraEvent.findMany({
      include: busesWithPaidPassengers,
      where: {
        date: {
          gte: subHours(new Date(), 8),
        },
        active: true,
      },
      orderBy: {
        date: 'asc'
      }
    });
    const eventWithParticiantCount = res.map((event) => ({
      ...event,
      maxSeats: event.buses.reduce((acc, bus) => acc + bus.seats, 0),
      bookedSeats: event.buses.reduce(
        (acc, bus) => acc + bus._count.passengers,
        0
      )
    }));

    return eventWithParticiantCount;
  }),
  getAwayGame: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await ctx.prisma.vastraEvent.findUnique({
        where: {
          id: input.id,
          active: true,
        },
        include: busesWithPaidPassengers,
      });

      if (!res) {
        return null;
      }
      return {
        ...res,
        buses: res.buses.sort((a, b) => a.name.localeCompare(b.name)).map((bus) => ({
          ...bus,
          availableSeats: bus.seats - bus._count.passengers
        }))
      };
    }),
  getAvailableMemberships: membershipProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.membership.findMany({
      where: {
        endDate: {
          gt: new Date()
        },
        startDate: {
          lte: new Date()
        }
      },
      select: {
        type: true,
        id: true,
        imageUrl: true,
        price: true,
        name: true,
      },
      orderBy: {
        endDate: 'desc'
      }
    });
    return {
      regular: res.find((m) => m.type === MembershipType.REGULAR),
      family: res.find((m) => m.type === MembershipType.FAMILY),
      youth: res.find((m) => m.type === MembershipType.YOUTH)
    };
  }),
  getStartPage: publicProcedure.query(async () => {
    const startPage = await getStartPage();
    return startPage;
  }),
  getHomeGames: publicProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.fotballGame.findMany({
      select: {
        date: true,
        id: true,
        awayTeam: true,
        homeTeam: true,
      },
      orderBy: {
        date: 'desc'
      }      
    });

    return res.map((game) => ({
      ...game,
      date: toUTCDate(game.date),
    }));
  }),
  getTicketStatistics: publicProcedure
  .input(z.object({ gameId: z.string() }))
  .query(async ({ input, ctx }) => {
    const res = await ctx.prisma.ticketSalesRecord.findMany({
      where: {
        fotballGameId: input.gameId
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        ticketsSold: true,
        createdAt: true,
      }
    });

    if (!res) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    return res.map((record) => ({
      'Sålda biljetter': record.ticketsSold,
      createdAt: toUTCDate(record.createdAt),
    }));
  }),
});
