import { isAfter } from "date-fns";
import { sv } from "date-fns/locale/sv";
import { ExternalLink } from "lucide-react";
import Head from "next/head";
import Link from "next/link";
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

  const { upcomingEvents, member, latestNewsPost, upcomingGame } = startPage;

  const seoDescription =
    "Välkommen till Västra Sidan. Vi är en supporterförening till IK Sirius som arbetar för att skapa en bättre upplevelse för blåsvarta supportrar.";

  const memberLink = featureFlags.ENABLE_MEMBERSHIPS
    ? {
        href: "/bli-medlem"
      }
    : {
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
        <h1 className="text-[2.3rem] font-extrabold text-white md:text-[4rem] lg:text-[5rem]">
          Västra Sidan
        </h1>
        <div
          className={`grid w-full grid-cols-1 gap-4 text-black md:w-10/12 md:grid-cols-2 md:gap-8`}
        >
          {latestNewsPost && (
            <Card title="Senaste nytt" href={`/nyheter/${latestNewsPost.slug}`}>
              <p className="text-2xl font-semibold">{latestNewsPost.title}</p>
              <p className="text-gray-400">{latestNewsPost.date}</p>
              <Wysiwyg content={latestNewsPost.excerpt} />
              <Button>Läs mer</Button>
            </Card>
          )}
          <Card title="Antal medlemmar" {...memberLink}>
            <p className="text-4xl">{member.count}</p>
            <p className="text-sm text-gray-500">Mål 2026, 1000 medlemmar</p>
            <p className="text-sm text-gray-500">
              Senast uppdaterad:{" "}
              {formatSwedishTime(member.updatedAt, "yyyy-MM-dd HH:mm", {
                locale: sv
              })}
            </p>
            <Button>Bli medlem</Button>
          </Card>
          {upcomingGame && (
            <Card
              title={`${upcomingGame.homeTeam} - ${upcomingGame.awayTeam}`}
              className="h-fit"
            >
              <p className="text-md">
                {formatSwedishTime(upcomingGame.date, "dd MMMM yyyy HH:mm", {
                  locale: sv,
                  timeZone: "Europe"
                })}
                , {upcomingGame.location}
              </p>
              <p className="text-4xl">
                {upcomingGame.ticketsSold} biljetter sålda
              </p>
              <p className="!mt-1 text-lg text-gray-400">
                Varav idag {upcomingGame.ticketsSoldToday} st
              </p>
              <p className="pb-1 text-sm text-gray-500">
                Senast uppdaterad:{" "}
                {formatSwedishTime(upcomingGame.updatedAt, "yyyy-MM-dd HH:mm", {
                  locale: sv
                })}
              </p>
              <Link href={upcomingGame.ticketLink} target="_blank">
                <Button className="w-full">Köp biljett</Button>
              </Link>
              <Link
                href={"/biljettstatistik"}
                className="mt-2 flex flex-row items-center gap-2 text-sm text-gray-500"
              >
                Se biljettstatistik
                <ExternalLink className="size-4" />
              </Link>
            </Card>
          )}
          {upcomingEvents.length > 0 && (
            <Card title="Kommande bortaresor">
              <div className="flex flex-col gap-4">
                {upcomingEvents.map((event) => {
                  const expired = isAfter(new Date(), event.date);
                  const full = event.bookedSeats >= event.maxSeats;
                  return (
                    <div
                      key={event.id}
                      className="flex flex-col gap-2 border-b border-slate-600 pb-4 last:border-0 last:pb-0"
                    >
                      <div className="space-y-1">
                        <p className="text-lg font-semibold">{event.name}</p>
                        <p className="text-md font-semibold">
                          Bussen avgår{" "}
                          {formatSwedishTime(event.date, "dd MMMM HH:mm", {
                            locale: sv
                          })}
                        </p>
                      </div>
                      <Progressbar
                        label="Antal anmälda"
                        maxValue={event.maxSeats}
                        currentValue={event.bookedSeats}
                      />
                      <Link href={`${PATHS.awayGames}${event.id}`}>
                        {expired ? (
                          <Button disabled className="w-full">
                            Bussen har avgått
                          </Button>
                        ) : full ? (
                          <Button disabled className="w-full">
                            Fullbokat
                          </Button>
                        ) : (
                          <Button className="w-full">Till anmälan</Button>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
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
  };
}
