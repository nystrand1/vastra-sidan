import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { api } from "~/utils/api";
import { GameMultiSelect } from "./GameMultiSelect";

const CHART_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316"
];

interface Game {
  id: string;
  homeTeam: string;
  awayTeam: string;
  date: number;
}

interface ComparisonViewProps {
  homeGames: Game[];
}

export const ComparisonView = ({ homeGames }: ComparisonViewProps) => {
  const [compareGameIds, setCompareGameIds] = useState<string[]>([]);
  const utils = api.useUtils();

  const gameColorMap = useMemo(
    () => new Map(homeGames.map((game, index) => [game.id, index])),
    [homeGames]
  );

  const getGameColor = useCallback(
    (gameId: string) =>
      CHART_COLORS[(gameColorMap.get(gameId) ?? 0) % CHART_COLORS.length]!,
    [gameColorMap]
  );

  const [comparisonData, setComparisonData] = useState<{
    data: Record<string, number>[];
    labels: { label: string; gameId: string }[];
  } | null>(null);

  useEffect(() => {
    if (compareGameIds.length === 0) {
      setComparisonData(null);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      const gamesData = (
        await Promise.all(
          compareGameIds.map(async (gameId) => {
            const data = await utils.public.getTicketStatistics.fetch({
              gameId
            });
            const game = homeGames.find((g) => g.id === gameId);
            if (!data || !game) return null;
            return { gameId, game, data };
          })
        )
      ).filter((x) => x !== null);

      if (cancelled || gamesData.length === 0) return;

      const allDaysSet = new Set<number>();
      const gamesByDay: Record<string, Map<number, number>> = {};
      const labels: { label: string; gameId: string }[] = [];

      for (const { gameId, game, data } of gamesData) {
        const label = `${game.homeTeam} - ${game.awayTeam} (${formatSwedishTime(game.date, "dd MMM")})`;
        labels.push({ label, gameId });
        const dayMap = new Map<number, number>();

        for (const record of data) {
          const daysBeforeMatch = Math.round(
            (game.date - record.createdAt) / (1000 * 60 * 60 * 24)
          );
          dayMap.set(daysBeforeMatch, record.ticketsSold);
          allDaysSet.add(daysBeforeMatch);
        }

        gamesByDay[label] = dayMap;
      }

      const allDays = Array.from(allDaysSet).sort((a, b) => b - a);

      const mergedData = allDays.map((daysLeft) => {
        const row: Record<string, number> = { daysLeft };
        for (const label of Object.keys(gamesByDay)) {
          const value = gamesByDay[label]!.get(daysLeft);
          if (value !== undefined) {
            row[label] = value;
          }
        }
        return row;
      });

      if (!cancelled) {
        setComparisonData({ data: mergedData, labels });
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [compareGameIds, homeGames, utils.public.getTicketStatistics]);

  const toggleCompareGame = (gameId: string) => {
    setCompareGameIds((prev) =>
      prev.includes(gameId)
        ? prev.filter((id) => id !== gameId)
        : [...prev, gameId]
    );
  };

  return (
    <>
      <GameMultiSelect
        games={homeGames}
        selectedIds={compareGameIds}
        onToggle={toggleCompareGame}
        getColor={getGameColor}
      />
      {comparisonData && (
        <ResponsiveContainer className="h-56 w-full" height={400}>
          <LineChart data={comparisonData.data}>
            <XAxis
              dataKey="daysLeft"
              reversed
              tickFormatter={(value: number) => `${value}d`}
              label={{
                value: "Dagar kvar till match",
                position: "insideBottom",
                offset: -5,
                fill: "#94a3b8"
              }}
            />
            <YAxis />
            <Tooltip
              wrapperClassName="!bg-slate-800 rounded-lg"
              labelClassName="bg-slate-800 text-white"
              labelFormatter={(value: number) => `${value} dagar kvar`}
            />
            <Legend />
            {comparisonData.labels.map(({ label, gameId }) => (
              <Line
                key={gameId}
                dot={false}
                connectNulls
                type="monotone"
                dataKey={label}
                stroke={getGameColor(gameId)}
                strokeWidth={2}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </>
  );
};
