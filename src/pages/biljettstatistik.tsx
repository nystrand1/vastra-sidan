import { format } from "date-fns";
import Head from "next/head";
import { useEffect, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "~/components/atoms/CardLink/CardLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { api } from "~/utils/api";



export const StatisticsPage = () => {
  const { data: homeGames } = api.public.getHomeGames.useQuery();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const { data: ticketSales } = api.public.getTicketStatistics.useQuery(
    { gameId: selectedGame as string },
    { enabled: !!selectedGame }
  );

  useEffect(() => {
    if (homeGames && homeGames[0]) {
      setSelectedGame(homeGames[0].id);
    }
  }, [homeGames]);

  if (!homeGames) return null;
  return (
    <>
      <Head>
        <title>Västra Sidan | Biljettstatistik</title>
        <meta name="title" key="title" content="Västra Sidan | Biljettstatistik" />
      </Head>
      <div className="flex flex-col items-center justify-center gap-12">
        <h1 className="text-[2.3rem] md:text-[4rem] lg:text-[5rem] font-extrabold text-white">
          Biljettstatistik
        </h1>
        <Card
          title="Biljettstatistik"
          className="w-full space-y-0"
        >
          <SelectField
            label="Välj match"
            name="game"
            className="w-full md:w-96"
            options={homeGames.map((x) => ({ label: `${x.homeTeam} - ${x.awayTeam} ${x.date}`, value: x.id }))}
            onChange={(e) => setSelectedGame(e.target.value)}
            />
          {ticketSales && (
            <ResponsiveContainer className="h-56 w-full" height={400}>
              <LineChart
                data={ticketSales} 
              >
                <XAxis dataKey="createdAt" tickFormatter={(value) => format(value as Date, 'dd MMM')} />
                <YAxis />
                <Tooltip 
                  wrapperClassName="!bg-slate-800 rounded-lg" 
                  labelClassName="bg-slate-800 text-white"
                  />
                <Line dot={{ display: 'none' }} type="monotone" dataKey="Sålda biljetter" stroke="#3b82f6" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
};

export default StatisticsPage;