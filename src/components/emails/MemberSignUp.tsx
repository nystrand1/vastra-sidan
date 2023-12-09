import { type Prisma } from '@prisma/client';
import { Container, Head, Hr, Img, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';
import { friendlyMembershipNames } from '~/server/utils/membership';

interface MemberSignupProps {
  membership: Prisma.MembershipGetPayload<{
    select: {
      imageUrl: true;
      type: true;
      name: true;
    }
  }>
}

const mockMembership: MemberSignupProps['membership'] = {
  imageUrl: 'https://cmsdev.vastrasidan.se/wp-content/uploads/2021/03/Medlemskort-2021.png',
  type: 'REGULAR',
  name: 'Medlemskap'
}

export const MemberSignup = ({
  membership = mockMembership,
}: MemberSignupProps) => {
  return (
    <Tailwind>
      <Html className="bg-slate-900">
        <Head>
          <title>Tack för att du blivit medlem!</title>
        </Head>
        <Section className="bg-slate-900 p-4">
          <Img src={membership.imageUrl} className="m-auto" style={{ maxHeight: 400 }} />
        </Section>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-5xl text-center">Tack att du blivit medlem i Västra Sidan</Text>
            <Hr />
            <Container>
              <Text className="text-lg">Medlemskap: {membership.name}, {friendlyMembershipNames[membership.type]}</Text>
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