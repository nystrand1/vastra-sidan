import { type ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { type adminEventFormatter } from "~/server/utils/admin/getEvents";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Event = Awaited<ReturnType<typeof adminEventFormatter>>;

export const columns: ColumnDef<Event>[] = [
  {
    accessorKey: 'id',
    enableHiding: true,
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Namn
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.title,
  },
  {
    accessorKey: "date",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Datum
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => formatSwedishTime(row.date, 'yyyy-MM-dd HH:mm')
  },
  {
    accessorKey: "numberOfBuses",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Antal bussar
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.buses.length
  },
  {
    accessorKey: "numberOfParticipants",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Antal passagerare
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.participants.length
  },
]