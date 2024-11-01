interface Column {
  key: string;
  title: string;
}

interface Row {
  id: number;
  [key: string]: string | number;
}

interface TableProps {
  data: Row[];
  columns: Column[];
}

export const Table: React.FC<TableProps> = ({ data, columns }) => {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {column.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((row) => (
          <tr key={row.id}>
            {columns.map((column) => (
              <td key={column.key} className="px-6 py-4 whitespace-nowrap">
                {row[column.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Table;
