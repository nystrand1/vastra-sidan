import { type ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { type adminSingleEventFormatter } from "~/server/utils/admin/getEvent";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Participant = Awaited<ReturnType<typeof adminSingleEventFormatter>>['participants'][number];

export const columns: ColumnDef<Participant>[] = [
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
    accessorFn: (row) => row.name,
  },
  {
    accessorKey: "bus",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Buss
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.bus
  },
  {
    accessorKey: "email",
    header: "Email",
    accessorFn: (row) => row.email
  },
  {
    accessorKey: "phone",
    header: "Telefon",
    accessorFn: (row) => row.phone
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
          Anmälningsdatum
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => formatSwedishTime(row.date, 'yyyy-MM-dd HH:mm')
  },
  {
    accessorKey: "member",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Medlem
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.member ? 'Ja' : 'Nej'
  },
  {
    accessorKey: "youth",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Ungdom
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => row.youth ? 'Ja' : 'Nej'
  },
]