import { signIn, signOut, useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { ButtonLink } from "~/components/ButtonLink/ButtonLink";
import Card from "~/components/CardLink/CardLink";
import { Progressbar } from "~/components/Progressbar/Progressbar";
import { api } from "~/utils/api";

export default function Home() {
  const hello = api.example.hello.useQuery({ text: "from tRPC" });

  const { data: awayGames, isLoading: isLoadingAwayGames } = api.wordpress.getAwayGames.useQuery();

  return (
    <>
      <Head>
        <title>Västra Sidan Events</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c]">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16 ">
          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
            Västra Sidan Events
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
            {isLoadingAwayGames && <p className="text-white">Loading events...</p>}
            {awayGames?.map((game) => (
              <Card
                key={game.id}
                title={game.enemyTeam}
                link={`/buss/${game.id}`}
              >
                <Progressbar
                  label="Antal anmälda"
                  maxValue={game.maxSeats}
                  currentValue={game.bookedSeats}
                />
                <ButtonLink href={`/buss/${game.id}`}>Åk Med!</ButtonLink>
              </Card>
            ))}
            </div>
        </div>
      </main>
    </>
  );
}

function AuthShowcase() {
  const { data: sessionData } = useSession();

  const { data: secretMessage } = api.example.getSecretMessage.useQuery(
    undefined, // no input
    { enabled: sessionData?.user !== undefined }
  );

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl text-white">
        {sessionData && <span>Logged in as {sessionData.user?.name}</span>}
        {secretMessage && <span> - {secretMessage}</span>}
      </p>
      <button
        className="rounded-full bg-white/10 px-10 py-3 font-semibold text-white no-underline transition hover:bg-white/20"
        onClick={sessionData ? () => void signOut() : () => void signIn()}
      >
        {sessionData ? "Sign out" : "Sign in"}
      </button>
    </div>
  );
}
