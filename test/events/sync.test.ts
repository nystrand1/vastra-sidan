import { addDays } from "date-fns";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { apolloClient } from "~/server/utils/apolloClient";
import { cronCaller } from "../helpers/caller";
import { prisma } from "../helpers/db";
import { server } from "../mocks/server";

const awayGame = (id: number, refundable: boolean | null) => ({
  __typename: "Awaygame",
  id,
  status: "publish",
  awayGameFields: {
    __typename: "AwayGameFields",
    date: addDays(new Date(), 7).toISOString(),
    busInfo: "Avgång från UKK",
    enemyTeam: `Motståndare ${id}`,
    memberPrice: 300,
    memberPriceYouth: 100,
    nonMemberPrice: 400,
    nonMemberPriceYouth: 200,
    refundable,
    buses: [
      {
        __typename: "AwayGameFieldsBuses",
        id: `bus-${id}`,
        busName: "Buss 1",
        maxSeats: 50,
        requiredSeats: 0,
        occupiedSeats: 0
      }
    ]
  }
});

const wordpressReturns = (games: ReturnType<typeof awayGame>[]) =>
  server.use(
    http.post("http://wordpress.test/graphql", () =>
      HttpResponse.json({
        data: { awayGames: { __typename: "RootQueryToAwaygameConnection", nodes: games } }
      })
    )
  );

const refundableById = async () =>
  Object.fromEntries(
    (await prisma.vastraEvent.findMany({ select: { id: true, refundable: true } })).map((e) => [
      e.id,
      e.refundable
    ])
  );

describe("syncing away games from WordPress", () => {
  it("syncs whether a trip is refundable, treating a missing value as refundable", async () => {
    wordpressReturns([awayGame(1, true), awayGame(2, false), awayGame(3, null)]);

    await cronCaller({ wordpress: apolloClient }).cron.syncEvents();

    expect(await refundableById()).toEqual({ "1": true, "2": false, "3": true });
  });

  it("updates an existing trip when the field is changed in WordPress", async () => {
    wordpressReturns([awayGame(1, true)]);
    await cronCaller({ wordpress: apolloClient }).cron.syncEvents();

    wordpressReturns([awayGame(1, false)]);
    await cronCaller({ wordpress: apolloClient }).cron.syncEvents();

    expect(await refundableById()).toEqual({ "1": false });
  });
});
