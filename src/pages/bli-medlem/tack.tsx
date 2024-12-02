import { useRouter } from "next/router";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";


const ThanksPage = () => {
  const { payment_intent: paymentId } = useRouter().query as { payment_intent: string };
  const { data, isLoading } = api.memberPayment.checkPaymentStatus.useQuery({ paymentId: paymentId || '' }, { enabled: !!paymentId });

  if (!paymentId) {
    return null;
  }

  if (isLoading) return (
    <div className="grid md:grid-cols-1 gap-4 md:items-stretch flex-wrap justify-center w-full md:6/12 lg:w-5/12 m-auto">
      <Card
        title="Laddar..."
        titleClassName="text-center !text-2xl"
        className="order-2 md:order-1"
      />
    </div>
  );

  if (!data) {
    return (
      <div className="grid md:grid-cols-1 gap-4 md:items-stretch flex-wrap justify-center w-full md:6/12 lg:w-5/12 m-auto">
        <Card
          title="Något gick fel"
          titleClassName="text-center !text-2xl"
          className="order-2 md:order-1"
        >
          <p>Det gick inte att hitta din bokning. Var god kontakta oss på <a href="mailto:info@vastrasidan.se">info@vastrasidan.se</a>
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-1 gap-4 md:items-stretch flex-wrap justify-center w-full md:6/12 lg:w-5/12 m-auto">
      <Card
        title={`Tack för att du blivit medlem!`}
        titleClassName="text-center !text-2xl"
        className="order-2 md:order-1"
      >
        <div className="divide-y-2">
          <div className="py-2">
            <p className="text-center">Vi har skickat ett bekräftelsemail till dig med mer information.</p>
          </div>
          <div className="py-2">
            <p className="text-center">Vid frågor eller funderingar, kontakta oss på <a href="mailto:info@vastrasidan.se">info@vastrasidan.se</a></p>
          </div>
        </div>
        <ButtonLink href={`/medlem/${data.id}`}>
          Visa medlemskort
        </ButtonLink>
      </Card>
    </div>
  )
};


export default ThanksPage;