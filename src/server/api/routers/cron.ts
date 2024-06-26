import { subMilliseconds } from "date-fns";
import { getTimezoneOffset } from "date-fns-tz";
import { createTRPCRouter, cronProcedure } from "~/server/api/trpc";
import {
  PATHS,
  RESOURCES,
  awayGameMapper,
  awayGameToEvent,
  makeRequest,
  upsertBus,
  upsertEvent,
  upsertMembership,
  wpMembershipToMembership
} from "~/server/utils/cron";
import { type AwayGame, type Membership } from "~/types/wordpressTypes";

interface SiriusGame {
  place: string;
  start: number;
  home: {
    name: string;
    logo: string;
    score: string;
  };
  away: {
    name: string;
    logo: string;
    score: string;
  };
  tickets: {
    availible: number; // API has a typo in the response
    link: string;
  }
}

interface MatchInfoResponse {
  next: SiriusGame;
  nextHome: SiriusGame
}

export const cronRouter = createTRPCRouter({
  syncEvents: cronProcedure.mutation(async ({ ctx }) => {
    console.info("Syncing events");
    const res = await makeRequest<AwayGame[]>(
      PATHS.acfURL + RESOURCES.awayGames,
      "GET"
    );
    const awayGames = res
      // uncomment to filter out games that have already happened
      //.filter((awayGame) => awayGame.acf.date >= new Date().toISOString())
      .sort((a, b) => {
        const [dayA, monthA, yearA] = a.acf.date.split("/") as [
          string,
          string,
          string
        ];
        const [dayB, monthB, yearB] = b.acf.date.split("/") as [
          string,
          string,
          string
        ];
        return (
          new Date(`${yearA}-${monthA}-${dayA}`).getTime() -
          new Date(`${yearB}-${monthB}-${dayB}`).getTime()
        );
      })
      .map(awayGameMapper)
      .map(awayGameToEvent);

    // Upsert events in database
    await Promise.all(
      awayGames.map(async ({ event: awayGame, buses }) => {
        await upsertEvent(awayGame, ctx);
        await Promise.all(buses.map((bus) => upsertBus(bus, ctx)));
      })
    );

    console.info(`Synced ${awayGames.length} events`);
    return "ok";
  }),
  syncMemberships: cronProcedure.mutation(async ({ ctx }) => {
    console.info("Syncing memberships");
    const res = await makeRequest<Membership[]>(
      PATHS.wpURL + RESOURCES.membership,
      "GET"
    );
    const memberships = res.flatMap(wpMembershipToMembership);
    await Promise.all(
      memberships.map((membership) => upsertMembership(membership, ctx))
    );
    console.info(`Synced ${memberships.length} memberships`);
    return "ok";
  }),
  syncTicketSales: cronProcedure.mutation(async ({ ctx }) => {
    console.info("Syncing ticket sales");
    const site = await fetch('https://www.siriusfotboll.se');
    const siteHtml = await site.text();
    const securityToken = siteHtml.match(/data-nonce="(.*)"/)?.[1];

    if (!securityToken) {
      console.error('Could not find security token');
      return;
    }

    const res = await makeRequest<MatchInfoResponse>(
      `https://www.siriusfotboll.se/ajax/matchinfo/?security=${securityToken}`,
      'GET'
    );

    const { next, nextHome } = res;

    if (!next || !nextHome) {
      return;
    }

    // Sirius API gives us a timezoned date instead of UTC, so we need to subtract
    // the difference before storing the date in DB
    const dateInMilliseconds = new Date(nextHome.start * 1000);
    const diffInMilliseconds = getTimezoneOffset('Europe/Stockholm', dateInMilliseconds);
    
    const utcDate = subMilliseconds(dateInMilliseconds, diffInMilliseconds);

    const existingGame = await ctx.prisma.fotballGame.findFirst({
      where: {
        date: utcDate,
      }
    });

    if (!existingGame) {
      // Create game if it doesn't exist
      const game = await ctx.prisma.fotballGame.create({
        data: {
          date: utcDate,
          homeTeam: nextHome.home.name,
          awayTeam: nextHome.away.name,
          ticketLink: nextHome.tickets.link,
          location: nextHome.place,
        }
      });

      // Create ticket sale
      await ctx.prisma.ticketSalesRecord.create({
        data: {
          ticketsSold: nextHome.tickets.availible,
          fotballGameId: game.id,
        }
      });
      return "ok";
    }

    // const latestTicketSale = await ctx.prisma.ticketSalesRecord.findFirst({
    //   where: {
    //     fotballGameId: existingGame.id,
    //   },
    //   orderBy: {
    //     createdAt: 'desc',
    //   }
    // });
    // // Don't update if the sales number is the same or lower
    // if (latestTicketSale && latestTicketSale?.ticketsSold >= nextHome.tickets.availible) {
    //   return "ok";
    // }
    await ctx.prisma.ticketSalesRecord.create({
      data: {
        ticketsSold: nextHome.tickets.availible,
        fotballGameId: existingGame.id,
      }
    });

    return "ok";
  }),
});
