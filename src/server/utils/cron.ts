import { type Membership, type Bus, type VastraEvent, MembershipType } from "@prisma/client";
import { type Membership as WPMembership } from '~/types/wordpressTypes'
import { type inferAsyncReturnType } from "@trpc/server";
import { parseISO } from "date-fns";
import { type createTRPCContext } from "../api/trpc";
import { env } from "~/env.mjs";
import { type AwayGame } from "~/types/wordpressTypes";

const apiKey = env.WORDPRESS_API_KEY;

export const baseUrl = env.NEXT_PUBLIC_WORDPRESS_URL;


export const RESOURCES = {
  memberPage: "options/acf-page-options",
  awayGames: "awaygames",
  membership: "membership",
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


export const awayGameToEvent = (awayGame: ReturnType<typeof awayGameMapper>) : { event: VastraEvent, buses: Bus[] }  => ({
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

export const upsertEvent = async (awayGame: VastraEvent, ctx: inferAsyncReturnType<typeof createTRPCContext>) => {
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

export const upsertBus = async (bus: Bus, ctx: inferAsyncReturnType<typeof createTRPCContext>) => {
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


export const wpMembershipToMembership = (wpMembership: WPMembership) : Omit<Membership, 'id'>[] => {
  const prices = {
    [MembershipType.FAMILY]: Number(wpMembership.acf.familyPrice),
    [MembershipType.REGULAR]: Number(wpMembership.acf.regularPrice),
    [MembershipType.YOUTH]: Number(wpMembership.acf.youthPrice),
  }
  const memberships: Omit<Membership, 'id'>[] = [MembershipType.FAMILY, MembershipType.REGULAR, MembershipType.YOUTH].map((membershipType) => ({
    wordpressId: wpMembership.id.toString(),
    imageUrl: wpMembership.acf.image.url,
    type: membershipType,
    price: prices[membershipType],
    startDate: parseISO(wpMembership.acf.startDate),
    endDate: parseISO(wpMembership.acf.endDate),
  }))

  return memberships;
}


export const upsertMembership = async (membership: Omit<Membership, 'id'>, ctx: inferAsyncReturnType<typeof createTRPCContext>) => {
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
    })
  } else {
    await ctx.prisma.membership.create({
      data: membership
    })
  }
}