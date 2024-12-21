import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";


const ThanksPage = () => {
  const { payment_intent: paymentId } = useRouter().query as { payment_intent: string };
  const { data, isLoading } = api.eventPayment.getBooking.useQuery({ paymentId: paymentId || '' }, { enabled: !!paymentId})

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
        title={`Bokningsbekräftelse: ${data.eventName}`}
        titleClassName="text-center !text-2xl"
        className="order-2 md:order-1"
      >
        <div className="divide-y-2">
          {data.participants.map((participant) => (
            <div key={participant.cancellationToken} className="flex justify-between flex-col py-2">
              <p>Namn: {participant.name}</p>
              <p>Email: {participant.email}</p>
              <p>Pris: {participant.payAmount} kr</p>
              {participant.note && (
                <p>Övrigt: {participant.note}</p>
              )}
            </div>
          ))}
          <div className="py-2">
            <p>Avgångstid: {data.departureTime}</p>
            <p>Totalpris: {data.totalPrice} kr</p>
            {data.gameInfo && (
              <Wysiwyg content={`Reseinfo: ${data.gameInfo}`} />
            )}
            <p>
              Avbokning kan endast ske senast 48 timmar innan avresa annars debiteras du fullt pris.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
};


export default ThanksPage;