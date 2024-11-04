import { type Member } from '@prisma/client';
import { Container, Head, Hr, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';

interface MemberSignupProps {
  member: Member,
  memberUrl: string,
}

const mockMembership: MemberSignupProps = {
  member: {
    id: '1',
    friendlyId: "1",
    familyMemberShipOwnerId: '1',
    firstName: "Filip",
    lastName: "Nystrand",
    email: "",
    phone: "",
  },
  memberUrl: "https://example.com",
}

export const MemberSignup = ({}: MemberSignupProps = mockMembership) => {
  return (
    <Tailwind>
      <Html className="bg-slate-900">
        <Head>
          <title>Tack för att du blivit medlem!</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          {/* <Img src={membership.imageUrl} className="m-auto" style={{ maxHeight: 400 }} /> */}
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-5xl text-center">Tack att du blivit medlem i Västra Sidan</Text>
            <Hr />
            <Container>
              <Text>
                Nu kan du njuta av alla medlemsförmåner som Västra Sidan har att erbjuda! Som t.ex rabatterade priser på Terassen i samband med matcher, samt billigare bussresor till bortamatcher.
              </Text>
            </Container>
            <Hr />
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
}

export default MemberSignup;