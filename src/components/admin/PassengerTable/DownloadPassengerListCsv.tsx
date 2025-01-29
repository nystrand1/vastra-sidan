import { type inferRouterOutputs } from "@trpc/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "~/components/ui/button";
import { type AppRouter } from "~/server/api/root";


type Passengers = inferRouterOutputs<AppRouter>['admin']['getEvent']['participants']

export const DownloadPassengerListCsv = ({ passengers, title }: { passengers: Passengers, title: string }) => {
  const csvHeaders = ['Namn', 'Email', 'Telefon', 'Medlem', 'Ungdom', 'Buss', 'Övrigt'].join(',');
  const sortedByBus = passengers.sort((a, b) => a.bus?.localeCompare(b.bus ?? '') ?? 0);
  const csvContent = sortedByBus.map(passenger => `${passenger.name},${passenger.email},'${passenger.phone},${passenger.member ? 'Ja' : 'Nej'},${passenger.youth ? 'Ja' : 'Nej'},${passenger.bus},${passenger.note ?? ''}`).join('\n');
  const blob = new Blob([csvHeaders + '\n' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}-passagerarlista.csv`;

  return (
    <Button className="w-fit" onClick={() => {
      a.click();
    }}>
      <DownloadIcon className="w-4 h-4" />
      Ladda ner passagerarlista
    </Button>
  )
}