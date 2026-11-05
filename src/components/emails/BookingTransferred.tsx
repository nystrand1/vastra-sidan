import { Container, Head, Hr, Html, Img, Section, Tailwind, Text } from "react-email";
import { type ParticipantTransfer, type VastraEvent } from "~/generated/prisma/browser";
import { formatSwedishTime } from "~/utils/formatSwedishTime";

interface BookingTransferredProps {
  transfer: ParticipantTransfer;
  event: VastraEvent;
}

const mockEvent: VastraEvent = {
  id: "testevent",
  name: "Testevent",
  description: "Testevent",
  date: new Date(),
  defaultPrice: 100,
  memberPrice: 100,
  youthPrice: 100,
  youthMemberPrice: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  active: true,
  refundable: true
};

const mockTransfer: ParticipantTransfer = {
  id: "testtransfer",
  createdAt: new Date(),
  participantId: "testpersson",
  previousToken: "testtoken",
  fromName: "Test Testsson",
  fromEmail: "test@testsson.com",
  fromPhone: "0701234567",
  toName: "Kalle Köpare",
  toEmail: "kalle@test.se",
  toPhone: "0701112233"
};

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const BookingTransferred = ({
  transfer = mockTransfer,
  event = mockEvent
}: BookingTransferredProps) => {
  const formattedDate = formatSwedishTime(event.date, "yyyy-MM-dd");
  return (
    <Tailwind>
      <Html className="bg-slate-900 font-sans">
        <Head>
          <title>Du har överlåtit din plats: {event.name}</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          <Img
            src={`${baseUrl}/static/vss_buss.jpg`}
            width="40%"
            className="m-auto"
          />
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-center text-5xl">Du har överlåtit din plats</Text>
            <Hr />
            <Text className="text-lg">
              Din plats på {event.name} ({formattedDate}) tillhör nu {transfer.toName}. Du kan
              inte längre hantera bokningen och ingen återbetalning görs. Vid frågor, kontakta
              info@vastrasidan.se.
            </Text>
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
};

export default BookingTransferred;
