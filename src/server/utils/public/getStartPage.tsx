import { featureFlags } from "~/utils/featureFlags";
import { getMemberCount } from "../member/getMemberCount";
import { getCardSkipperMemberCount } from "../cardSkipper";
import { prisma } from "~/server/db";
import { busesWithPaidPassengers } from "~/server/api/routers/public";
import { subHours } from "date-fns";
import { apolloClient } from "../apolloClient";
import { GetNewsDocument } from "~/types/wordpresstypes/graphql";
import { parseDateString, stripHtmlTags } from "~/server/api/routers/wordpress";
import { toUTCDate } from "../helpers";

export const getStartPage = async () => {
  const memberCountPromise = featureFlags.ENABLE_MEMBERSHIPS ? getMemberCount() : getCardSkipperMemberCount();
  const upcomingEventPromise = featureFlags.ENABLE_AWAYGAMES ? prisma.vastraEvent.findFirst({
    include: busesWithPaidPassengers,
    where: {
      date: {
        gte: subHours(new Date(), 0.5) // Show event for an additional 30 minutes
      },
      active: true,
    },
    orderBy: {
      date: 'asc'
    }
  }) : null;

  const newsPromise = apolloClient.query({
    query: GetNewsDocument,
    variables: {
      limit: 1
    },
  });

  const upcomingGamePromise = prisma.fotballGame.findFirst({
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

  const [memberCount, upcomingEvent, { data }, upcomingGame] = await Promise.all([
    memberCountPromise,
    upcomingEventPromise,
    newsPromise,
    upcomingGamePromise,
  ]);

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
    member: {
      count: memberCount,
      updatedAt: new Date(),
    },
    latestNewsPost: newsPost,
    upcomingGame: !!upcomingGame && upcomingGame.ticketSalesRecords[0] && {
      homeTeam: upcomingGame.homeTeam,
      awayTeam: upcomingGame.awayTeam,
      date: toUTCDate(upcomingGame.date),
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
}