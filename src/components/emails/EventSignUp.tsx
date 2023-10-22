import { Button } from '@react-email/button';
import { Container, Head, Hr, Img, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';
import { format } from "date-fns";
import { type ParticipantWithBusAndEvent } from "~/server/api/routers/eventPayment";

interface EventSignUpProps {
  participant: ParticipantWithBusAndEvent;
  cancellationUrl: string;
}

const mockBus: EventSignUpProps['participant']['bus'] = {
  id: 'testbus',
  name: 'Testbuss',
  eventId: 'testevent',
  seats: 50,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockEvent: EventSignUpProps['participant']['event'] = {
  id: 'testevent',
  name: 'Testevent',
  description: 'Testevent',
  date: new Date(),
  defaultPrice: 100,
  memberPrice: 100,
  youthPrice: 100,
  youthMemberPrice: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockParticipant: EventSignUpProps['participant'] = {
  id: "testpersson",
  name: 'Test Testsson',
  email: 'test@testsson.com',
  userEmail: 'test@testsson.com',
  payAmount: 100,
  phone: '0701234567',
  createdAt: new Date(),
  updatedAt: new Date(),
  eventId: 'testevent',
  youth: false,
  member: false,
  bus: mockBus,
  cancellationDate: new Date(),
  cancellationToken: 'testtoken',
  note: 'Testnote',
  busId: 'testbus',
  event: mockEvent,
  checkedIn: false,
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const EventSignUp = ({
  participant = mockParticipant,
  cancellationUrl
}: EventSignUpProps) => {
  const {
    name,
    payAmount,
    note,
    bus,
    event
  } = participant;

  const formattedDate = format(event.date, 'yyyy-MM-dd');
  const departureTime = format(event.date, 'HH:mm');

  const {
    name: eventName,
  } = event;
  return (
    <Tailwind>
      <Html className="bg-slate-900">
        <Head>
          <title>Anmälan till {eventName}</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          <Img src={`${baseUrl}/static/vss_buss.jpg`} width="40%" className="m-auto" />
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-5xl text-center">Tack för anmälan</Text>
            <Hr />
            <Container>
              <Text className="text-lg">Event: {eventName}</Text>
              <Text className="text-lg">Namn: {name}</Text>
              {bus && (
                <Text className="text-lg">Buss: {bus.name}</Text>
              )}
              <Text className="text-lg">Datum: {formattedDate}</Text>
              <Text className="text-lg">Avgångstid: {departureTime}</Text>
              <Text className="text-lg">Pris: {payAmount} kr</Text>
              {note && <Text className="text-lg">Övrigt: {note}</Text>}
            </Container>
            <Hr />
            <Text className="text-lg">Du kan avboka din plats genom att klicka på knappen nedan</Text>
            <Button
              pX={20}
              pY={12}
              href={cancellationUrl}
              className="bg-blue-500 hover:bg-blue-700 font-bold py-2 px-4 rounded text-white"
            >
              Avboka
            </Button>
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
}

export default EventSignUp;