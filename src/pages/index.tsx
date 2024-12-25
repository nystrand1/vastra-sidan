import { isAfter } from "date-fns";
import { sv } from "date-fns/locale/sv";
import Head from "next/head";
import Card from "~/atoms/CardLink/CardLink";
import { Progressbar } from "~/atoms/Progressbar/Progressbar";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { Button } from "~/components/ui/button";
import { api } from "~/utils/api";
import { PATHS } from "~/utils/constants";
import { createSSRHelper } from "~/utils/createSSRHelper";
import { featureFlags } from "~/utils/featureFlags";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

export default function Home() {
  const { data: startPage } = api.public.getStartPage.useQuery();

  if (!startPage) {
    return null;
  }

  const { upcomingEvent, member, latestNewsPost, upcomingGame } = startPage;

  const seoDescription = "Välkommen till Västra Sidan. Vi är en supporterförening till IK Sirius som arbetar för att skapa en bättre upplevelse för blåsvarta supportrar."

  const upcomingEventExpired = upcomingEvent ? isAfter(new Date(), upcomingEvent.date) : false;

  const memberLink = featureFlags.ENABLE_MEMBERSHIPS ? {
    href: "/bli-medlem",
  } : {
    href: "https://apply.cardskipper.se/pxvo",
    target: "_blank"
  };

  return (
    <>
      <Head>
        <title>Västra Sidan | Startsida</title>
        <meta name="title" key="title" content="Västra Sidan | Startsida" />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div className="flex flex-col items-center justify-center gap-12">
        <h1 className="text-[2.3rem] md:text-[4rem] lg:text-[5rem] font-extrabold text-white">
          Västra Sidan
        </h1>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 text-black w-full md:w-10/12`}>
          {latestNewsPost && (
            <Card
              title="Senaste nytt"
              href={`/nyheter/${latestNewsPost.slug}`}
            >
              <p className="text-2xl font-semibold">{latestNewsPost.title}</p>
              <p className="text-gray-400">{latestNewsPost.date}</p>
              <Wysiwyg content={latestNewsPost.excerpt} />
              <Button>Läs mer</Button>
            </Card>
          )}
          <Card
            title="Antal medlemmar"
            {...memberLink}
          >
            <p className="text-4xl">{member.count}</p>
            <p className="text-sm text-gray-500">Mål 2025, 1000 medlemmar</p>
            <p className="text-sm text-gray-500">Senast uppdaterad: {formatSwedishTime(member.updatedAt, "yyyy-MM-dd HH:mm", { locale: sv })}</p>
            <Button>Bli medlem</Button>
          </Card>
          {upcomingGame && (
            <Card
              title={`${upcomingGame.homeTeam} - ${upcomingGame.awayTeam}`}
              href={upcomingGame.ticketLink}
            >
              <p className="text-md">{formatSwedishTime(upcomingGame.date, "dd MMMM yyyy HH:mm", { locale: sv, timeZone: 'Europe' })}, {upcomingGame.location}</p>
              <p className="text-4xl">{upcomingGame.ticketsSold} biljetter sålda</p>
              <p className="text-sm text-gray-500">Senast uppdaterad: {formatSwedishTime(upcomingGame.updatedAt, "yyyy-MM-dd HH:mm", { locale: sv })}</p>
              <Button>Köp biljett</Button>
            </Card>
          )}
          {upcomingEvent && (
            <Card
              title="Nästa bortaresa"
              href={`${PATHS.awayGames}${upcomingEvent.id}`}
            >
              <div className="space-y-1">
                <p className="text-lg font-semibold">{upcomingEvent.name}</p>
                <p className="text-md font-semibold">Bussen avgår {formatSwedishTime(upcomingEvent.date, "HH:mm", { locale: sv, timeZone: 'Europe' })}</p>
              </div>
              <Progressbar
                label="Antal anmälda"
                maxValue={upcomingEvent.maxSeats}
                currentValue={upcomingEvent.bookedSeats}
              />
              {upcomingEventExpired && (
                <Button disabled>Bussen har avgått</Button>
              )}
              {!upcomingEventExpired && upcomingEvent.bookedSeats < upcomingEvent.maxSeats && (
                <Button>Till anmälan</Button>
              )}
              {!upcomingEventExpired && upcomingEvent.bookedSeats >= upcomingEvent.maxSeats && (
                <Button disabled>Fullbokat</Button>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}


export async function getStaticProps() {
  const ssrHelper = await createSSRHelper();

  await ssrHelper.public.getStartPage.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate()
    },
    revalidate: 60
  }
}
