import { Button, Container, Head, Hr, Html, Img, Section, Tailwind, Text } from "react-email";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

interface PayerBookingSummaryProps {
  eventName: string;
  eventDate: Date;
  travellers: { name: string }[];
  /** What the payer paid, in kronor */
  totalAmount: number;
  myTripsUrl: string;
  websiteUrl: string;
}

const previewProps: PayerBookingSummaryProps = {
  eventName: "Testevent",
  eventDate: new Date(),
  travellers: [{ name: "Bo Berg" }, { name: "Cia Cederlund" }],
  totalAmount: 800,
  myTripsUrl: "http://localhost:3000/mina-bussresor",
  websiteUrl: "http://localhost:3000"
};

/**
 * Sent to a signed-in payer who booked seats only for other people. The travellers get their
 * own confirmations with manage links; the payer manages every seat from "Mina bussresor".
 */
export const PayerBookingSummary = ({
  eventName = previewProps.eventName,
  eventDate = previewProps.eventDate,
  travellers = previewProps.travellers,
  totalAmount = previewProps.totalAmount,
  myTripsUrl = previewProps.myTripsUrl,
  websiteUrl = previewProps.websiteUrl
}: PayerBookingSummaryProps) => {
  const formattedDate = formatSwedishTime(eventDate, "yyyy-MM-dd");
  const departureTime = formatSwedishTime(eventDate, "HH:mm");
  const seats = travellers.length === 1 ? "1 plats" : `${travellers.length} platser`;
  return (
    <Tailwind>
      <Html className="bg-slate-900 font-sans">
        <Head>
          <title>Din bokning: {eventName}</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          <Img src={`${websiteUrl}/static/vss_buss.jpg`} width="40%" className="m-auto" />
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-center text-5xl">Tack för din bokning</Text>
            <Hr />
            <Text className="text-lg">
              Du har bokat {seats} till {eventName}.
            </Text>
            <Text className="text-lg">Datum: {formattedDate}</Text>
            <Text className="text-lg">Avgångstid: {departureTime}</Text>
            <Text className="text-lg">Resenärer:</Text>
            {travellers.map((t, i) => (
              <Text key={i} className="ml-4 text-lg">
                {t.name}
              </Text>
            ))}
            <Text className="text-lg">Totalt: {totalAmount} kr</Text>
            <Hr />
            <Text className="text-lg">
              Varje resenär har fått ett eget mail om sin plats. Du kan se och hantera alla
              platser under Mina bussresor.
            </Text>
            <Button
              href={myTripsUrl}
              className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
            >
              Mina bussresor
            </Button>
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
};

export default PayerBookingSummary;
