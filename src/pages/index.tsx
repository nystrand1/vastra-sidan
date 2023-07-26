import Head from "next/head";
import Card from "~/atoms/CardLink/CardLink";
import { Progressbar } from "~/atoms/Progressbar/Progressbar";
import { api } from "~/utils/api";
import { PATHS } from "~/utils/constants";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function Home() {
  const { data: awayGames, isLoading: isLoadingAwayGames } = api.public.getAwayGames.useQuery();

  return (
    <>
      <Head>
        <title>Västra Sidan Events</title>
      </Head>
        <div className="flex flex-col items-center justify-center gap-12">
          <h1 className="text-5xl font-extrabold text-white sm:text-[5rem]">
            Västra Sidan Events
          </h1>
          <div className="grid grid-cols-12 gap-4 md:gap-8 text-black w-full">
            {isLoadingAwayGames && <p className="text-white">Laddar events...</p>}
            {awayGames?.map((game) => (
              <div key={game.id} className="col-span-12 md:col-span-4">
                <Card
                  title={game.name}
                  link={`${PATHS.awayGames}${game.id}`}
                >
                  <Progressbar
                    label="Antal anmälda"
                    maxValue={game.maxSeats}
                    currentValue={game.bookedSeats}
                  />
                </Card>
              </div>
            ))}
            </div>
        </div>
    </>
  );
}


export async function getServerSideProps() {
  const ssrHelper = await createSSRHelper();

  await ssrHelper.public.getAwayGames.prefetch();

  return {
    props: {
      dehydratedState: ssrHelper.dehydrate()
    }
  }
}
