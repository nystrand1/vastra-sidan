import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import type { RouterOutputs } from "~/utils/api";

type TicketData = RouterOutputs["public"]["getTicketStatistics"];

interface TotalChartProps {
  data: TicketData;
}

export const TotalChart = ({ data }: TotalChartProps) => {
  const chartData = data.map((record) => ({
    createdAt: record.createdAt,
    "Sålda biljetter": record.ticketsSold
  }));

  return (
    <ResponsiveContainer className="h-56 w-full" height={400}>
      <LineChart data={chartData}>
        <XAxis
          dataKey="createdAt"
          tickFormatter={(value: number) => formatSwedishTime(value, "dd MMM")}
        />
        <YAxis />
        <Tooltip
          wrapperClassName="!bg-slate-800 rounded-lg"
          labelClassName="bg-slate-800 text-white"
          labelFormatter={(value: number) =>
            formatSwedishTime(value, "yyyy-MM-dd HH:mm")
          }
        />
        <Line
          dot={{ display: "none" }}
          type="monotone"
          dataKey="Sålda biljetter"
          stroke="#3b82f6"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
