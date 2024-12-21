import { type ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { type adminMemberFormatter } from "~/server/utils/admin/getActiveMembers";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
 
// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Member = Awaited<ReturnType<typeof adminMemberFormatter>>;
 
export const columns: ColumnDef<Member>[] = [
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
    accessorKey: "membershipName",
    header: "Medlemskap",
    accessorFn: (row) => row.activeMembership.name
  },
  {
    accessorKey: "type",
    header: "Typ",
    accessorFn: (row) => row.activeMembership.type
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
    accessorKey: "becameMemberAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="p-0 bg-transparent hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Blev medlem
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    accessorFn: (row) => formatSwedishTime(row.activeMembership.becameMemberAt, 'yyyy-MM-dd HH:mm'),
  },
]