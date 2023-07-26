import {
  type createTRPCContext,
  createTRPCRouter,
  cronProcedure,
} from "~/server/api/trpc";
import { type AwayGame } from "~/types/wordpressTypes";
import { awayGameMapper, makeRequest, PATHS } from "./wordpress";
import { type Bus, type VastraEvent } from "@prisma/client";
import { type inferAsyncReturnType, inferProcedureOutput } from "@trpc/server";
import { AppRouter } from "../root";

const awayGameToEvent = (awayGame: ReturnType<typeof awayGameMapper>) : { event: VastraEvent, buses: Bus[] }  => ({
  event: {
    id: awayGame.id.toString(),
    name: `${awayGame.enemyTeam} - ${awayGame.date}`,
    description: awayGame.busInfo || "",
    date: new Date(),
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
    id: `${awayGame.id}-${awayGame.enemyTeam}-${bus.busName}`,
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


export const cronRouter = createTRPCRouter({
  syncEvents: cronProcedure
    .mutation(async ({ ctx, input }) => {
      console.info("Syncing events");
      console.info('input', input);
      const res = await makeRequest<AwayGame[]>(PATHS.acfURL + "awaygames", 'GET');
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
