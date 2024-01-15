import { format } from "date-fns";
import Head from "next/head";
import Card from "~/atoms/CardLink/CardLink";
import { Progressbar } from "~/atoms/Progressbar/Progressbar";
import { Button } from "~/components/atoms/Button/Button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import { api } from "~/utils/api";
import { PATHS } from "~/utils/constants";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function Home() {
  const { data: startPage } = api.public.getStartPage.useQuery();

  if (!startPage) {
    return null;
  }

  const { upcomingEvent, memberCount } = startPage;

  const cols = upcomingEvent && upcomingEvent?.id ? 2 : 1;

  const className = upcomingEvent && upcomingEvent?.id ? "" : "md:max-w-[66%] md:m-auto";

  return (
    <>
      <Head>
        <title>Västra Sidan | Startsida</title>
      </Head>
        <div className="flex flex-col items-center justify-center gap-12">
          <h1 className="text-[2.3rem] md:text-[4rem] lg:text-[5rem] font-extrabold text-white">
            Västra Sidan
          </h1>
          <div className={`grid md:grid-cols-${cols} gap-4 md:gap-8 text-black w-full md:w-8/12`}>
            <Card 
              title="Antal medlemmar"
              className={`w-full first-letter:space-y-0 md:h-52 ${className}`}
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
                    <p className="text-sm">Pris vuxen medlem: {upcomingEvent.memberPrice} kr</p>
                    <p className="text-sm">Pris vuxen icke medlem: {upcomingEvent.defaultPrice} kr</p>
                    <p className="text-sm">Pris ungdom medlem: {upcomingEvent.youthMemberPrice} kr</p>
                    <p className="text-sm">Pris ungdom icke medlem: {upcomingEvent.youthPrice} kr</p>
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
