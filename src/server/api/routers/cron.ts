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
  })
});
