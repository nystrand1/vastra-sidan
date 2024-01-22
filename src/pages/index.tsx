import { format } from "date-fns";
import Head from "next/head";
import Card from "~/atoms/CardLink/CardLink";
import { Progressbar } from "~/atoms/Progressbar/Progressbar";
import { Button } from "~/components/atoms/Button/Button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { PATHS } from "~/utils/constants";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function Home() {
  const { data: startPage } = api.public.getStartPage.useQuery();

  if (!startPage) {
    return null;
  }

  const { upcomingEvent, memberCount, latestNewsPost } = startPage;

  const desktopCols = upcomingEvent ? 'md:grid-cols-3' : 'md:grid-cols-2';

  const seoDescription = "Välkommen till Västra Sidan. Vi är en supporterförening till IK Sirius som arbetar för att skapa en bättre upplevelse för blåsvarta supportrar."

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
          <div className={`grid grid-cols-1 ${desktopCols} gap-4 md:gap-8 text-black w-full md:w-10/12`}>
            {latestNewsPost && (
              <Card 
                title="Senaste nytt"
                className="h-fit"
              >
                <p className="text-2xl font-semibold">{latestNewsPost.title}</p>
                <p className="text-gray-400">{latestNewsPost.date}</p>
                <Wysiwyg content={latestNewsPost.excerpt} />
                <ButtonLink href={`/nyheter/${latestNewsPost.slug}`}>Läs mer</ButtonLink>
              </Card>
            )}
            <Card 
              title="Antal medlemmar"
              className={`w-full first-letter:space-y-0 md:h-52`}
              contentClassName="flex flex-col justify-between h-full"
            >
              <p className="text-4xl">{memberCount}</p>
              <ButtonLink href="https://apply.cardskipper.se/pxvo" target="_blank" className="w-full">Bli medlem</ButtonLink>
            </Card>
              {upcomingEvent && upcomingEvent.id && (
                <Card
                  title="Nästa bortaresa"
                  link={`${PATHS.awayGames}${upcomingEvent.id}`}
                >
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">{upcomingEvent.name}</p>
                    <p className="text-md font-semibold">Bussen avgår {format(upcomingEvent.date, "HH:mm")}</p>
                  </div>
                  <Progressbar
                    label="Antal anmälda"
                    maxValue={upcomingEvent.maxSeats}
                    currentValue={upcomingEvent.bookedSeats}
                  />
                  {upcomingEvent.bookedSeats < upcomingEvent.maxSeats && (
                    <Button>Till anmälan</Button>
                  )}
                  {upcomingEvent.bookedSeats >= upcomingEvent.maxSeats && (
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
