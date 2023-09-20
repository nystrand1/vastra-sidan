import { format } from "date-fns";
import { useRouter } from "next/router";
import { AwayGameRules } from "~/components/atoms/AwayGameRules/AwayGameRules";
import { AwayGameForm } from "~/components/common/AwayGameForm/AwayGameForm";
import { api } from "~/utils/api";


export const BusPage = () => {
  const { id } = useRouter().query;
  const { data: game, isLoading: isLoadingGame } = api.public.getAwayGame.useQuery({ id: id as string });

  if (!game || isLoadingGame) return null;


  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <h1 className="text-center text-4xl md:text-5xl font-extrabold tracking-tight text-white sm:text-5xl">
        {game.name}
      </h1>
      <p className="text-3xl">
        Bussen avgår {format(game.date, "hh:mm")}
      </p>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-5 order-2 md:order-1">
          <AwayGameRules />
        </div>
        <div className="col-span-12 md:col-span-7 lg:col-span-4 lg:col-start-8 order-1 md:order-2 pb-6 md:pb-0">
          <AwayGameForm />
        </div>
      </div>
    </div>
  )
};

export default BusPage;