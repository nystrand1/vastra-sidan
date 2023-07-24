import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "../trpc";

import type {
  AwayGame,
  MenuItem,
  NewsPost, StartPage, WPOptionsPage,
} from '../../../types/wordpressTypes';
import { env } from "~/env.mjs";

const apiKey = env.WORDPRESS_API_KEY;

const baseUrl = env.NEXT_PUBLIC_WORDPRESS_URL;

export const PATHS = {
  acfURL: baseUrl + "/wp-json/acf/v3/",
  wpURL: baseUrl + "/wp-json/wp/v2/",
  wpMemberMailURL: baseUrl + "/wp-json/sendNewMemberMail/v2",
  wpBusMailURL: baseUrl + "/wp-json/sendBusMail/v2",
  wpUpdateMemberURL: baseUrl + "/wp-json/updateMemberCount/v2",
  wpUpdatePassengerURL: baseUrl + "/wp-json/updateBusPassengerCount/v2",
  wpMenu: baseUrl + "/wp-json/menu/",
}

export const RESOURCES = {
  news: "news",
  header: "header",
  memberPage: "options/acf-page-options",
  awayGames: "awaygames",
  startPage: "options/acf-page-home",
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


export const wordpressRouter = createTRPCRouter({
  getNews: publicProcedure
    .query(async () => {
      const res = await makeRequest<NewsPost[]>(PATHS.wpURL + RESOURCES.news, 'GET');
      return {
        news: res
      };
    }),
  getNewsPost: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({input}) => {
      const res = await makeRequest<NewsPost[]>(PATHS.wpURL + `${RESOURCES.news}?slug=` + input.slug, 'GET');
      return {
        newsPost: res[0]
      };
    }),
  getHeaderMenu: publicProcedure
    .query(async () => {
      const res = await makeRequest<MenuItem[]>(PATHS.wpMenu + RESOURCES.header, 'GET');
      return {
        headerMenu: res
      };
    }),
  getMemberPage: publicProcedure
    .query(async () => {
      const res = await makeRequest<WPOptionsPage>(PATHS.acfURL + RESOURCES.memberPage, 'GET');
      return {
        ...res.acf,
        memberInfo: res?.acf.memberinfo
      };
    }),
  getAwayGames: publicProcedure
    .query(async () => {
      const res = await makeRequest<AwayGame[]>(PATHS.acfURL + RESOURCES.awayGames, 'GET');
      return res
      // uncomment to filter out games that have already happened
      //.filter((awayGame) => awayGame.acf.date >= new Date().toISOString())
      .sort((a, b) => {
        const [dayA, monthA, yearA] = a.acf.date.split("/") as [string, string, string]
        const [dayB, monthB, yearB] = b.acf.date.split("/") as [string, string, string]
        return new Date(`${yearA}-${monthA}-${dayA}`).getTime() - new Date(`${yearB}-${monthB}-${dayB}`).getTime()
      })
      .map(awayGameMapper)
  }),
  getAwayGame: publicProcedure
    .input(z.object({ id: z.string().or(z.number()) }))
    .query(async ({input}) => {
      const res = await makeRequest<AwayGame>(PATHS.acfURL + `${RESOURCES.awayGames}/${input.id}`, 'GET');
      return awayGameMapper(res)
    }),
  getStartPage: publicProcedure
    .query(async () => {
      const res = await makeRequest<StartPage>(PATHS.acfURL + RESOURCES.startPage, 'GET');
      return {
        ...res.acf,
      };
    })
});
