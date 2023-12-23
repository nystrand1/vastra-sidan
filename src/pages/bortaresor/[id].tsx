import { format } from "date-fns";
import Head from "next/head";
import { useRouter } from "next/router";
import Accordion from "~/components/atoms/Accordion/Accordion";
import { awayGameRules } from "~/components/atoms/Accordion/accordionContent";
import { AwayGameForm } from "~/components/common/AwayGameForm/AwayGameForm";
import { api } from "~/utils/api";


export const BusPage = () => {
  const { id } = useRouter().query;
  const { data: game, isLoading: isLoadingGame } = api.public.getAwayGame.useQuery({ id: id as string });

  if (!game || isLoadingGame) return null;


  return (
    <>
      <Head>
        <title>{game.name} | Västra Sidan</title>
        <meta name="description" key="description" content={game.description} />
      </Head>
      <div className="flex flex-col items-center justify-center gap-6">
        <h1 className="text-center text-4xl md:text-5xl font-extrabold tracking-tight text-white sm:text-5xl">
          {game.name}
        </h1>
        <p className="text-3xl">
          Bussen avgår {format(game.date, "HH:mm")}
        </p>
        <Accordion
          items={[
            awayGameRules,
            {
              title: 'Bussinfo',
              content: game.description
            }
          ]}
          className="w-full space-y-6" 
          />
        <AwayGameForm />
      </div>
    </>
  )
};

export default BusPage;