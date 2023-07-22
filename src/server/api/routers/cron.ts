import {
  createTRPCRouter,
  cronProcedure,
} from "~/server/api/trpc";
import { type AwayGame } from "~/types/wordpressTypes";
import { awayGameMapper, makeRequest, PATHS } from "./wordpress";
import { type VastraEvent } from "@prisma/client";
import { z } from "zod";



const awayGameToEvent = (awayGame: ReturnType<typeof awayGameMapper>) : VastraEvent => ({
  id: awayGame.id.toString(),
  name: `${awayGame.enemyTeam} - ${awayGame.date}`,
  description: awayGame.busInfo || "",
  date: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  defaultPrice: Number(awayGame.nonMemberPrice),
  memberPrice: Number(awayGame.memberPrice),
  youthPrice: Number(awayGame.nonMemberPriceYouth),
  youthMemberPrice: Number(awayGame.memberPriceYouth),
})

export const cronRouter = createTRPCRouter({
  syncEvents: cronProcedure
    .input(z.any())
    .mutation(async ({ ctx, input }) => {
      console.log('data', input);
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
      await Promise.all(awayGames.map(async (awayGame) => {
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
      }));
      console.info(`Synced ${awayGames.length} events`)
      return "ok";
  }),
});
