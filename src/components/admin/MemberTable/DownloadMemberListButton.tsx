import { type inferRouterOutputs } from "@trpc/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { type AppRouter } from "~/server/api/root";


export type Members = inferRouterOutputs<AppRouter>['admin']['getActiveMembers']


export const DownloadMemberListButton = ({ members }: { members: Members }) => {
  const csvHeaders = ['Namn', 'Email', 'Telefon'].join(',');
  const csvContent = members.map(member => `${member.name},${member.email},'${member.phone}`).join('\n');
  const blob = new Blob([csvHeaders + '\n' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medlemslista.csv';

  return (
    <Button className="w-fit" onClick={() => {
      a.click();
    }}>
      <DownloadIcon className="w-4 h-4" />
      Ladda ner medlemslista
    </Button>
  )
}