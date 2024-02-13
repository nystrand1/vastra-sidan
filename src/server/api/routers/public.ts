import {
  MembershipType,
  SwishPaymentStatus,
  SwishRefundStatus
} from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { subHours } from "date-fns";
import { z } from "zod";
import { createTRPCRouter, membershipProcedure, publicProcedure } from "~/server/api/trpc";
import { getCardSkipperMemberCount } from "~/server/utils/cardSkipper";
import { GetNewsDocument } from "~/types/wordpresstypes/graphql";
import { parseDateString, stripHtmlTags } from "./wordpress";
import { featureFlags } from "~/utils/featureFlags";

const busesWithPaidPassengers = {
  buses: {
    include: {
      _count: {
        select: {
          passengers: {
            where: {
              swishPayments: {
                some: {
                  status: SwishPaymentStatus.PAID
                }
              },
              swishRefunds: {
                none: {
                  status: SwishRefundStatus.PAID
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
          gte: subHours(new Date(), 8)
        }
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
          id: input.id
        },
        include: busesWithPaidPassengers,
      });

      if (!res) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return res;
    }),
  getAvailableMemberships: membershipProcedure.query(async ({ ctx }) => {
    const res = await ctx.prisma.membership.findMany({
      where: {
        endDate: {
          gt: new Date()
        }
      },
      select: {
        type: true,
        id: true,
        imageUrl: true,
        price: true,
      }
    });
    return {
      regular: res.find((m) => m.type === MembershipType.REGULAR),
      family: res.find((m) => m.type === MembershipType.FAMILY),
      youth: res.find((m) => m.type === MembershipType.YOUTH)
    };
  }),
  getStartPage: publicProcedure.query(async ({ ctx }) => {
    const memberCount = await getCardSkipperMemberCount();
    const upcomingEvent = featureFlags.ENABLE_AWAYGAMES ? await ctx.prisma.vastraEvent.findFirst({
      include: busesWithPaidPassengers,
      where: {
        date: {
          gte: subHours(new Date(), 8)
        }
      }
    }) : null;

    const { data } = await ctx.apolloClient.query({
      query: GetNewsDocument,
      variables: {
        limit: 1
      },
    });

    const upcomingGame = await ctx.prisma.fotballGame.findFirst({
      where: {
        date: {
          gte: subHours(new Date(), 8)
        }
      },
      include: {
        ticketSalesRecords: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        }
      }
    });

    const [latestNewsPost] = data.newsPosts.nodes;

    let newsPost = null;

    if (latestNewsPost) {
      newsPost = {
        id: latestNewsPost.id,
        slug: latestNewsPost.slug,
        title: latestNewsPost.newsContent.title,
        excerpt: stripHtmlTags(latestNewsPost.newsContent.text).split(".").splice(0, 1).join(" ") + ".",
        date: parseDateString(latestNewsPost.date),
        image: latestNewsPost.newsContent.newsImg,
      }
    }

    return {
      memberCount,
      latestNewsPost: newsPost,
      upcomingGame: !!upcomingGame && upcomingGame.ticketSalesRecords[0] && {
        homeTeam: upcomingGame.homeTeam,
        awayTeam: upcomingGame.awayTeam,
        date: upcomingGame.date,
        location: upcomingGame.location,
        ticketLink: upcomingGame.ticketLink,
        ticketsSold: upcomingGame?.ticketSalesRecords[0].ticketsSold,
        updatedAt: upcomingGame.ticketSalesRecords[0].createdAt,
      },
      upcomingEvent: !!upcomingEvent && {
        ...upcomingEvent,
        maxSeats: upcomingEvent?.buses.reduce((acc, bus) => acc + bus.seats, 0),
        bookedSeats: upcomingEvent?.buses.reduce(
          (acc, bus) => acc + bus._count.passengers,
          0
        )
      }
    };
  }),
});
