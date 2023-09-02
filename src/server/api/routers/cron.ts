import { type Bus, type VastraEvent } from "@prisma/client";
import { type inferAsyncReturnType } from "@trpc/server";
import {
  createTRPCRouter,
  cronProcedure,
  type createTRPCContext,
} from "~/server/api/trpc";
import { type AwayGame } from "~/types/wordpressTypes";
import { env } from "~/env.mjs";
import { parseISO } from "date-fns";

const apiKey = env.WORDPRESS_API_KEY;

const baseUrl = env.NEXT_PUBLIC_WORDPRESS_URL;

export const RESOURCES = {
  memberPage: "options/acf-page-options",
  awayGames: "awaygames",
}

export const PATHS = {
  acfURL: baseUrl + "/wp-json/acf/v3/",
  wpURL: baseUrl + "/wp-json/wp/v2/",
}


export const makeRequest = async <T>(url: string, method: string, body?: BodyInit) : Promise<T> => {
  const headers = new Headers();
  headers.set("Authorization", "Bearer " + apiKey)
  try {
    const res = await fetch(url, {
      method: method,
      headers: headers,
      body: body
    });
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    return res.json() as T;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

const awayGameToEvent = (awayGame: ReturnType<typeof awayGameMapper>) : { event: VastraEvent, buses: Bus[] }  => ({
  event: {
    id: awayGame.id.toString(),
    name: `${awayGame.enemyTeam} - ${awayGame.date.split(" ")[0] || ''}`,
    description: awayGame.busInfo || "",
    date: parseISO(awayGame.date),
    createdAt: new Date(),
    updatedAt: new Date(),
    defaultPrice: Number(awayGame.nonMemberPrice),
    memberPrice: Number(awayGame.memberPrice),
    youthPrice: Number(awayGame.nonMemberPriceYouth),
    youthMemberPrice: Number(awayGame.memberPriceYouth)
  },
  buses: awayGameToBuses(awayGame)
})

const awayGameToBuses = (awayGame: ReturnType<typeof awayGameMapper>) : Bus[] => {
  return awayGame.buses.map((bus) => ({
    id: `${awayGame.id}-${bus.busName}`,
    name: bus.busName,
    seats: Number(bus.maxSeats),
    createdAt: new Date(),
    updatedAt: new Date(),
    eventId: awayGame.id.toString(),
  }))
}

const upsertEvent = async (awayGame: VastraEvent, ctx: inferAsyncReturnType<typeof createTRPCContext>) => {
  const existingEvent = await ctx.prisma.vastraEvent.findUnique({
    where: {
      id: awayGame.id
    }
  })
  if (existingEvent) {
    await ctx.prisma.vastraEvent.update({
      where: {
        id: awayGame.id
      },
      data: awayGame
    })
  } else {
    await ctx.prisma.vastraEvent.create({
      data: awayGame
    })
  }
}

const upsertBus = async (bus: Bus, ctx: inferAsyncReturnType<typeof createTRPCContext>) => {
  const existingBus = await ctx.prisma.bus.findUnique({
    where: {
      id: bus.id
    }
  })
  if (existingBus) {
    await ctx.prisma.bus.update({
      where: {
        id: bus.id
      },
      data: bus
    })
  } else {
    await ctx.prisma.bus.create({
      data: bus
    })
  }
}

export const awayGameMapper = (awayGame: AwayGame) => (
  {
    ...awayGame.acf,
    id: awayGame.id,
    enemyTeam: awayGame.acf.enemyteam,
    busInfo: awayGame.acf.businfo,
    memberPrice: awayGame.acf.memberprice,
    memberPriceYouth: awayGame.acf.memberprice_youth,
    nonMemberPrice: awayGame.acf.nonmemberprice,
    nonMemberPriceYouth: awayGame.acf.nonmemberprice_youth,
    maxSeats: awayGame.acf.buses.reduce((acc, bus) => acc + Number(bus.maxSeats), 0),
    bookedSeats: awayGame.acf.buses.reduce((acc, bus) => acc + Number(bus.occupiedSeats), 0),
  }
);


export const cronRouter = createTRPCRouter({
  syncEvents: cronProcedure
    .mutation(async ({ ctx }) => {
      console.info("Syncing events");
      const res = await makeRequest<AwayGame[]>(PATHS.acfURL + RESOURCES.awayGames, 'GET');
      const awayGames = res
        // uncomment to filter out games that have already happened
        //.filter((awayGame) => awayGame.acf.date >= new Date().toISOString())
        .sort((a, b) => {
          const [dayA, monthA, yearA] = a.acf.date.split("/") as [string, string, string]
          const [dayB, monthB, yearB] = b.acf.date.split("/") as [string, string, string]
          return new Date(`${yearA}-${monthA}-${dayA}`).getTime() - new Date(`${yearB}-${monthB}-${dayB}`).getTime()
        })
        .map(awayGameMapper)
        .map(awayGameToEvent)

      // Upsert events in database
      await Promise.all(awayGames.map(async ({ event: awayGame, buses }) => {
        await upsertEvent(awayGame, ctx);
        await Promise.all(buses.map((bus) => upsertBus(bus, ctx)))
      }));

      console.info(`Synced ${awayGames.length} events`)
      return "ok";
  }),
});
