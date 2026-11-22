import { Button, Container, Head, Hr, Html, Section, Tailwind, Text } from "react-email";

interface LoginCodeProps {
  code: string;
  /** Signs in with the same code, so one click is enough. */
  signInUrl: string;
}

export const LoginCode = ({
  code = "123456",
  signInUrl = "http://localhost:3000/loggain#email=test%40testsson.com&kod=123456"
}: LoginCodeProps) => {
  return (
    <Tailwind>
      <Html className="bg-slate-900 font-sans">
        <Head>
          <title>Din inloggningskod till Västra Sidan</title>
        </Head>
        <Section className="bg-slate-800 p-4 text-white">
          <Container>
            <Text className="text-center text-xl">Din inloggningskod till Västra Sidan</Text>
            <Text className="text-center text-5xl font-bold tracking-widest">{code}</Text>
            <Container className="text-center">
              <Button
                href={signInUrl}
                className="rounded bg-blue-500 px-4 py-2 font-bold text-white"
              >
                Logga in
              </Button>
            </Container>
            <Hr />
            <Text className="text-lg">Koden gäller i 10 minuter.</Text>
            <Text className="text-lg">
              Om du inte försökte logga in kan du ignorera det här mailet.
            </Text>
          </Container>
        </Section>
      </Html>
    </Tailwind>
  );
};

export default LoginCode;
