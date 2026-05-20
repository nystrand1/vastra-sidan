import Head from "next/head";
import { useEffect, useState } from "react";
import Card from "~/components/atoms/CardLink/CardLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { ComparisonView } from "~/components/common/TicketStatistics/ComparisonView";
import { DailyChart } from "~/components/common/TicketStatistics/DailyChart";
import { TotalChart } from "~/components/common/TicketStatistics/TotalChart";
import { Button } from "~/components/ui/button";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

type ViewMode = "total" | "daily" | "compare";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "total", label: "Total" },
  { mode: "daily", label: "Per dag" },
  { mode: "compare", label: "Jämför matcher" }
];

export const StatisticsPage = () => {
  const { data: homeGames } = api.public.getHomeGames.useQuery();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("total");

  const { data: ticketSales } = api.public.getTicketStatistics.useQuery(
    { gameId: selectedGame as string },
    { enabled: !!selectedGame && viewMode !== "compare" }
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
        <meta
          name="title"
          key="title"
          content="Västra Sidan | Biljettstatistik"
        />
      </Head>
      <div className="flex flex-col items-center justify-center gap-12">
        <h1 className="text-[2.3rem] font-extrabold text-white md:text-[4rem] lg:text-[5rem]">
          Biljettstatistik
        </h1>
        <Card
          title="Biljettstatistik"
          className="w-full space-y-0 !overflow-visible"
        >
          <div className="mb-4 flex gap-2">
            {VIEW_MODES.map(({ mode, label }) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "outline"}
                size="sm"
                className="w-auto"
                onClick={() => setViewMode(mode)}
              >
                {label}
              </Button>
            ))}
          </div>

          {viewMode !== "compare" && (
            <SelectField
              label="Välj match"
              name="game"
              className="w-full md:w-96"
              options={homeGames.map((x) => ({
                label: `${x.homeTeam} - ${x.awayTeam} ${formatSwedishTime(x.date, "yyyy-MM-dd HH:mm")}`,
                value: x.id
              }))}
              onChange={(e) => setSelectedGame(e.target.value)}
            />
          )}

          {viewMode === "total" && ticketSales && (
            <TotalChart data={ticketSales} />
          )}

          {viewMode === "daily" && ticketSales && (
            <DailyChart data={ticketSales} />
          )}

          {viewMode === "compare" && <ComparisonView homeGames={homeGames} />}
        </Card>
      </div>
    </>
  );
};

export default StatisticsPage;

export const getStaticProps = async () => {
  const ssg = await createSSRHelper();

  const homeGames = await ssg.public.getHomeGames.fetch();

  const promises = homeGames.map((game) =>
    ssg.public.getTicketStatistics.prefetch({ gameId: game.id })
  );
  await Promise.all(promises);
  return {
    props: {
      trpcState: ssg.dehydrate()
    },
    revalidate: 300
  };
};
