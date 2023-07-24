import { signIn, signOut, useSession } from "next-auth/react";
import Head from "next/head";
import Card from "~/atoms/CardLink/CardLink";
import { Progressbar } from "~/atoms/Progressbar/Progressbar";
import { api } from "~/utils/api";
import { PATHS } from "~/utils/constants";

export default function Home() {
  const { data: awayGames, isLoading: isLoadingAwayGames } = api.wordpress.getAwayGames.useQuery();

  return (
    <>
      <Head>
        <title>Västra Sidan Events</title>
      </Head>
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
            Västra Sidan Events
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8 text-black">
            {isLoadingAwayGames && <p className="text-white">Loading events...</p>}
            {awayGames?.map((game) => (
              <Card
                key={game.id}
                title={game.enemyTeam}
                link={`${PATHS.awayGames}${game.id}`}
              >
                <Progressbar
                  label="Antal anmälda"
                  maxValue={game.maxSeats}
                  currentValue={game.bookedSeats}
                />
              </Card>
            ))}
            </div>
        </div>
    </>
  );
}
