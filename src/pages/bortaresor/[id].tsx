import { useRouter } from "next/router";
import { AwayGameRules } from "~/components/atoms/AwayGameRules/AwayGameRules";
import { AwayGameForm } from "~/components/common/AwayGameForm/AwayGameForm";
import { api } from "~/utils/api";


export const BusPage = () => {
  const { id } = useRouter().query;
  const { data: game, isLoading: isLoadingGame } = api.wordpress.getAwayGame.useQuery({ id: id as string });

  if (!game || isLoadingGame) return null;


  return (
    <div className="flex flex-col items-center justify-center gap-12">
      <h1 className="text-center text-4xl md:text-5xl font-extrabold tracking-tight text-white sm:text-[5rem]">
        {game.enemyTeam} - {game.date}
      </h1>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6 order-2 md:order-1">
          <AwayGameRules />
        </div>
        <div className="col-span-12 md:col-span-6 order-1 md:order-2">
          <AwayGameForm />
        </div>
      </div>
    </div>
  )
};

export default BusPage;