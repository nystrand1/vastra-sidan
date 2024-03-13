import Head from "next/head";
import { AwayGameRules } from "~/components/atoms/AwayGameRules/AwayGameRules";
import Card from "~/components/atoms/CardLink/CardLink";

export const AwayGameRulesPage = () => {
  const seoDescription = "Västra Sidan är en supporterförening till IK Sirius. Vi är en ideell förening som arbetar för att skapa en bättre upplevelse för IK Sirius supportrar."

  return (
    <>
      <Head>
        <title>Regler för bortaresor | Västra Sidan</title>
        <meta name="title" key="title" content="Regler för bortaresor | Västra Sidan" />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <div className="grid md:grid-cols-1 gap-4 md:items-stretch flex-wrap justify-center w-full md:6/12 lg:w-5/12 m-auto">
          <Card
            title="Västra Sidans Regler för bortaresor"
            titleClassName="text-center !text-2xl"
            className="order-2 md:order-1"
          >
            <AwayGameRules />
          </Card>
        </div>
      </div>
    </>
  )
}

export default AwayGameRulesPage;
