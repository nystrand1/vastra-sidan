import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { useState } from "react"
import { InputField } from "~/components/atoms/InputField/InputField"
import { SelectField } from "~/components/atoms/SelectField/SelectField"
import { Button } from "~/components/ui/button"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

interface PassengerTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[],
  onRowClick?: (id: string) => void
  busOptions?: {
    label: string,
    value: string
  }[]
}

export function PassengerTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  busOptions,
}: PassengerTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    []
  );
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      columnVisibility: {
        id: false,
      },
    },
  })

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 py-4 md:space-x-4">
        <InputField
          placeholder="Namn"
          label="Namn"
          className="w-full md:w-56"
          onChange={(e) => table.getColumn('name')?.setFilterValue(e.target.value)}
        />
        <InputField
          placeholder="Email"
          label="Email"
          className="w-full md:w-56"
          onChange={(e) => table.getColumn('email')?.setFilterValue(e.target.value)}
        />
        {busOptions && (
          <SelectField
            label="Buss"
            value={table.getColumn('bus')?.getFilterValue() as string}
            options={busOptions}
            className="w-full md:w-56"
            onChange={(e) => table.getColumn('bus')?.setFilterValue(e.target.value)}
          />
        )}
      </div>
      <div className="rounded-md border border-slate-600">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead className="text-white" key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  onClick={() => {
                    const memberId = row.getValue('id')
                    if (onRowClick && typeof memberId === 'string') {
                      onRowClick(memberId)
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Inga resultat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Föregående
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Nästa
        </Button>
      </div>
    </div>
  )
}
