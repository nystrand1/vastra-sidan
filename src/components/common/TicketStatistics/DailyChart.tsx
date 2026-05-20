import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import type { RouterOutputs } from "~/utils/api";

type TicketData = RouterOutputs["public"]["getTicketStatistics"];

interface DailyChartProps {
  data: TicketData;
}

export const DailyChart = ({ data }: DailyChartProps) => {
  const dailyData = useMemo(() => {
    if (data.length === 0) return [];

    const byDay = new Map<string, number>();

    for (const record of data) {
      const dayKey = formatSwedishTime(record.createdAt, "yyyy-MM-dd");
      const existing = byDay.get(dayKey);
      if (!existing || record.ticketsSold > existing) {
        byDay.set(dayKey, record.ticketsSold);
      }
    }

    const days = Array.from(byDay.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    return days
      .map(([day, maxTickets], index) => {
        const prevMax = index > 0 ? days[index - 1]![1] : maxTickets;
        return {
          day,
          "Sålda per dag": index === 0 ? 0 : maxTickets - prevMax
        };
      })
      .filter((_, index) => index > 0);
  }, [data]);

  if (dailyData.length === 0) return null;

  return (
    <ResponsiveContainer className="h-56 w-full" height={400}>
      <BarChart data={dailyData}>
        <XAxis
          dataKey="day"
          tickFormatter={(value: string) =>
            formatSwedishTime(new Date(value), "dd MMM")
          }
        />
        <YAxis />
        <Tooltip
          wrapperClassName="!bg-slate-800 rounded-lg"
          labelClassName="bg-slate-800 text-white"
        />
        <Bar dataKey="Sålda per dag" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
