import { MembershipType } from "@prisma/client";
import { Button, Container, Head, Hr, Img, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';

interface MemberSignupProps {
  member: {
    name: string,
    email: string,
    phone?: string,
  },
  membershipType: MembershipType,
  memberUrl: string,
  memberImageUrl: string,
}

const mockMembership: MemberSignupProps = {
  member: {
    name: "Filip Nystrand",
    email: "filip.nystrand@gmail.com",
    phone: "0303000000",
  },
  membershipType: MembershipType.REGULAR,
  memberUrl: "https://example.com",
  memberImageUrl: "https://cmsdev.vastrasidan.se/wp-content/uploads/2021/03/Medlemskort-2021.png"
}

export const MemberSignup = ({
  member = mockMembership.member,
  memberImageUrl = mockMembership.memberImageUrl,
  memberUrl = mockMembership.memberUrl,
}: MemberSignupProps) => {
  return (
    <Tailwind>
      <Html className="bg-slate-900 font-sans">
        <Head>
          <title>Tack för att du blivit medlem!</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          <Img src={memberImageUrl} className="m-auto" style={{ maxHeight: 400 }} />
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-5xl text-center">Tack att du blivit medlem i Västra Sidan</Text>
            <Hr />
            <Container>
              <Text>
                Nu kan du njuta av alla medlemsförmåner som Västra Sidan har att erbjuda! Som t.ex rabatterade priser på Terassen i samband med matcher, samt billigare bussresor till bortamatcher.
              </Text>
              <Text>
                Om du har några frågor eller funderingar är du välkommen att kontakta oss på info@vastrasidan.se
              </Text>
              <Text>
                Du kan med fördel bokmärka länken nedan för att snabbt komma åt ditt medlemskap.
              </Text>
            </Container>
            <Section>
              <Text className='text-2xl'>
                Dina uppgifter
              </Text>
              <Text>
                {member.name}
              </Text>
              {member.email && (
                <Text>
                  {member.email}
                </Text>
              )}
              {member.phone && (
                <Text>
                  {member.phone}
                </Text>
              )}
            </Section>
            <Hr />
            <Button
              href={memberUrl}
              className="bg-blue-500 hover:bg-blue-700 font-bold py-2 px-4 rounded text-white"
            >
              Visa medlemskap
            </Button>
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
}

export default MemberSignup;