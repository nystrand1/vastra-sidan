import { VastraEvent, type Participant } from "@prisma/client";
import { Button } from '@react-email/button';
import { Container, Head, Img, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';
import * as React from 'react';

interface EventSignUpProps {
  participant: Participant
  event: VastraEvent
  cancellationUrl: string;
}

const mockParticipant: Participant = {
  id: "testpersson",
  name: 'Test Testsson',
  email: 'test@testsson.com',
  payAmount: 100,
  phone: '0701234567',
  createdAt: new Date(),
  updatedAt: new Date(),
  eventId: 'testevent',
  youth: false,
  member: false,
}

const mockEvent: VastraEvent = {
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

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';

export const EventSignUp = ({
  participant = mockParticipant,
  event = mockEvent,
  cancellationUrl
}: EventSignUpProps) => {
  const {
    name,
    payAmount,
  } = participant;

  const {
    name: eventName,
  } = event;
  return (
    <Tailwind>
      <Html className="bg-slate-900">
        <Head />
        <Section className="bg-slate-900">
          <Img src={`${baseUrl}/static/vss_buss.jpg`} width="40%" className="m-auto" />
        </Section>
        <Section className="bg-slate-800 p-4 mt-4">
          <Container>
            <Text className="text-white text-5xl text-center">Tack för anmälan {name}</Text>
            <Text className="text-white text-2xl">Du är nu anmäld till eventet</Text>
            <Text className="text-white text-lg">Du kan avboka din plats genom att klicka på knappen nedan</Text>
            <Button
              pX={20}
              pY={12}
              href={cancellationUrl}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
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