import {
  MembershipType,
  type Bus,
  type Prisma,
  type VastraEvent
} from "@prisma/client";
import { type inferAsyncReturnType } from "@trpc/server";
import { parseISO } from "date-fns";
import { env } from "~/env.mjs";
import { type createTRPCContext } from "../api/trpc";
import { captureException } from "@sentry/nextjs";
import { type GetMembershipsQuery, type GetAwayGamesQuery } from "~/types/wordpresstypes/graphql";

const apiKey = env.WORDPRESS_API_KEY;

export const baseUrl = env.NEXT_PUBLIC_WORDPRESS_URL;

type MembershipPayload = Prisma.MembershipUpsertArgs["create"];

export const RESOURCES = {
  memberPage: "options/acf-page-options",
  awayGames: "awaygames",
  membership: "membership"
};

export const PATHS = {
  acfURL: baseUrl + "/wp-json/acf/v3/",
  wpURL: baseUrl + "/wp-json/wp/v2/"
};

export const makeRequest = async <T>(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: BodyInit
): Promise<T> => {
  const headers = new Headers();
  headers.set("Authorization", "Bearer " + apiKey);
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
    captureException(error);
    throw error;
  }
};

type AwayGame = GetAwayGamesQuery['awayGames']['nodes'][0];

export const awayGameMapper = ({ awayGame, id, status }: AwayGame) => ({
  ...awayGame,
  status,
  id,
  maxSeats: awayGame.buses.reduce(
    (acc, bus) => acc + Number(bus.maxSeats),
    0
  ),
  bookedSeats: awayGame.buses.reduce(
    (acc, bus) => acc + Number(bus.occupiedSeats),
    0
  )
});

export const awayGameToEvent = (
  awayGame: ReturnType<typeof awayGameMapper>
): { event: VastraEvent; buses: Bus[] } => {
  return {
    event: {
      id: awayGame.id.toString(),
      name: `${awayGame.enemyTeam} - ${awayGame.date.split(" ")[0] || ""}`,
      description: awayGame.busInfo || "",
      date: new Date(awayGame.date),
      createdAt: new Date(),
      updatedAt: new Date(),
      defaultPrice: Number(awayGame.nonMemberPrice),
      memberPrice: Number(awayGame.memberPrice),
      youthPrice: Number(awayGame.nonMemberPriceYouth),
      youthMemberPrice: Number(awayGame.memberPriceYouth),
      active: awayGame.status === "publish"
    },
    buses: awayGameToBuses(awayGame)
  }
};

const awayGameToBuses = (
  awayGame: ReturnType<typeof awayGameMapper>
): Bus[] => {
  // If VSK game, use the legacy ID
  return awayGame.buses.map((bus) => ({
    id: awayGame.id.toString() === '3473' ? `${awayGame.id}-${bus.busName}` : bus.id,
    name: bus.busName,
    seats: Number(bus.maxSeats),
    createdAt: new Date(),
    updatedAt: new Date(),
    eventId: awayGame.id.toString(),
  }));
};

export const upsertEvent = async (
  awayGame: VastraEvent,
  ctx: inferAsyncReturnType<typeof createTRPCContext>
) => {
  const existingEvent = await ctx.prisma.vastraEvent.findUnique({
    where: {
      id: awayGame.id
    }
  });
  if (existingEvent) {
    await ctx.prisma.vastraEvent.update({
      where: {
        id: awayGame.id
      },
      data: awayGame
    });
  } else {
    await ctx.prisma.vastraEvent.create({
      data: awayGame
    });
  }
};

export const upsertBus = async (
  bus: Bus,
  ctx: inferAsyncReturnType<typeof createTRPCContext>
) => {
  const existingBus = await ctx.prisma.bus.findUnique({
    where: {
      id: bus.id
    }
  });
  if (existingBus) {
    await ctx.prisma.bus.update({
      where: {
        id: bus.id
      },
      data: bus
    });
  } else {
    await ctx.prisma.bus.create({
      data: bus
    });
  }
};

export const wpMembershipToMembership = (
  wpMembership: GetMembershipsQuery['memberships']['nodes'][number]
): MembershipPayload[] => {
  const prices = {
    [MembershipType.FAMILY]: Number(wpMembership.membership.familyPrice) * 100,
    [MembershipType.REGULAR]: Number(wpMembership.membership.regularPrice) * 100,
    [MembershipType.YOUTH]: Number(wpMembership.membership.youthPrice) * 100
  };
  const memberships: MembershipPayload[] = [
    MembershipType.FAMILY,
    MembershipType.REGULAR,
    MembershipType.YOUTH
  ].map((membershipType) => ({
    wordpressId: wpMembership.id.toString(),
    name: wpMembership.title,
    imageUrl: wpMembership.membership.image.sourceUrl,
    textureUrl: wpMembership.membership.model.mediaItemUrl,
    type: membershipType,
    price: prices[membershipType],
    startDate: parseISO(wpMembership.membership.startDate),
    endDate: parseISO(wpMembership.membership.endDate),
    updatedAt: new Date()
  }));

  return memberships;
};

export const upsertMembership = async (
  membership: MembershipPayload,
  ctx: inferAsyncReturnType<typeof createTRPCContext>
) => {
  const existingMembership = await ctx.prisma.membership.findFirst({
    where: {
      wordpressId: membership.wordpressId,
      type: membership.type
    }
  });
  if (existingMembership) {
    await ctx.prisma.membership.update({
      where: {
        id: existingMembership.id
      },
      data: membership
    });
  } else {
    await ctx.prisma.membership.create({
      data: membership
    });
  }
};
