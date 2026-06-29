import { featureFlags } from "~/utils/featureFlags";
import { getMemberCount } from "../member/getMemberCount";
import { getCardSkipperMemberCount } from "../cardSkipper";
import { prisma } from "~/server/db";
import { busesWithPaidPassengers } from "~/server/api/routers/public";
import { isToday, subHours } from "date-fns";
import { apolloClient } from "../apolloClient";
import { GetNewsDocument } from "~/types/wordpresstypes/graphql";
import { parseDateString, stripHtmlTags } from "~/server/api/routers/wordpress";
import { toUTCDate } from "../helpers";

export const getStartPage = async () => {
  const memberCountPromise = featureFlags.ENABLE_MEMBERSHIPS
    ? getMemberCount()
    : getCardSkipperMemberCount();
  const upcomingEventsPromise = featureFlags.ENABLE_AWAYGAMES
    ? prisma.vastraEvent.findMany({
        include: busesWithPaidPassengers,
        where: {
          date: {
            gte: subHours(new Date(), 0.5) // Show event for an additional 30 minutes
          },
          active: true
        },
        orderBy: {
          date: "asc"
        }
      })
    : null;

  const newsPromise = apolloClient.query({
    query: GetNewsDocument,
    variables: {
      limit: 1
    }
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
          createdAt: "desc"
        }
      }
    }
  });

  const [memberCountData, upcomingEventsData, newsPostData, upcomingGameData] =
    await Promise.allSettled([
      memberCountPromise,
      upcomingEventsPromise,
      newsPromise,
      upcomingGamePromise
    ]);

  const [latestNewsPost] =
    newsPostData.status === "fulfilled"
      ? newsPostData.value.data.newsPosts.nodes
      : [];

  let newsPost = null;

  if (latestNewsPost) {
    newsPost = {
      id: latestNewsPost.id,
      slug: latestNewsPost.slug,
      title: latestNewsPost.newsContent.title,
      excerpt:
        stripHtmlTags(latestNewsPost.newsContent.text)
          .split(".")
          .splice(0, 1)
          .join(" ") + ".",
      date: parseDateString(latestNewsPost.date),
      image: latestNewsPost.newsContent.newsImg
    };
  }

  const upcomingGame =
    upcomingGameData.status === "fulfilled" ? upcomingGameData.value : null;

  const salesRecordsToday = upcomingGame?.ticketSalesRecords.filter((record) =>
    isToday(record.createdAt)
  );
  const [firstRecord, lastRecord] =
    salesRecordsToday && salesRecordsToday.length > 0
      ? [salesRecordsToday[0], salesRecordsToday[salesRecordsToday.length - 1]]
      : [];
  let ticketsSoldToday = null;
  if (firstRecord && lastRecord) {
    ticketsSoldToday = firstRecord.ticketsSold - lastRecord.ticketsSold;
  }

  const memberCount =
    memberCountData.status === "fulfilled" ? memberCountData.value : 0;
  const upcomingEvents =
    upcomingEventsData.status === "fulfilled" ? upcomingEventsData.value : [];

  return {
    member: {
      count: memberCount,
      updatedAt: new Date()
    },
    latestNewsPost: newsPost,
    upcomingGame: !!upcomingGame &&
      upcomingGame.ticketSalesRecords[0] && {
        homeTeam: upcomingGame.homeTeam,
        awayTeam: upcomingGame.awayTeam,
        date: toUTCDate(upcomingGame.date),
        location: upcomingGame.location,
        ticketLink: upcomingGame.ticketLink,
        ticketsSold: upcomingGame?.ticketSalesRecords[0].ticketsSold,
        ticketsSoldToday,
        updatedAt: upcomingGame.ticketSalesRecords[0].createdAt
      },
    upcomingEvents:
      upcomingEvents?.map((event) => ({
        ...event,
        maxSeats: event.buses.reduce((acc, bus) => acc + bus.seats, 0),
        bookedSeats: event.buses.reduce(
          (acc, bus) => acc + bus._count.passengers,
          0
        )
      })) ?? []
  };
};
