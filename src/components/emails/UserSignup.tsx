import { Button, Container, Head, Hr, Section, Tailwind, Text } from "@react-email/components";
import { Html } from '@react-email/html';

interface UserSignupProps {
  token: string;
}

const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000';


export const UserSignup = ({
  token = 'adssadasd',
}: UserSignupProps) => {
  const verifyUrl = `${baseUrl}/medlem/verify/${token}`;
  return (
    <Tailwind>
      <Html className="bg-slate-900">
        <Head>
          <title>Aktivera ditt konto</title>
        </Head>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-xl text-center">Tack för att du skapat ett konto! Klicka på knappen nedan för att verifiera din mail</Text>
            <Hr />
            <Container className="flex items-center justify-center">
              <Button
                pX={20}
                pY={12}
                href={verifyUrl}
                className="bg-blue-500 hover:bg-blue-700 font-bold py-2 px-4 rounded text-white"
              >
                Verifiera
              </Button>
            </Container>
            <Hr />
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
}

export default UserSignup;