import { useRouter } from "next/router";
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
        </div>
      </Card>
    </div>
  )
};


export default ThanksPage;