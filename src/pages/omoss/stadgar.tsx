import Head from "next/head";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const Stadgar = () => {
  const { data } = api.wordpress.getAboutUsPage.useQuery();

  if (!data) return null;

  const { orgChart } = data;

  const seoDescription = "Västra Sidan är en supporterförening till IK Sirius. Vi är en ideell förening som arbetar för att skapa en bättre upplevelse för IK Sirius supportrar."

  return (
    <>
      <Head>
        <title>Stadgar | Västra Sidan</title>
        <meta name="title" key="title" content="Stadgar | Västra Sidan" />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Stadgar</h1>
        <div className="grid md:grid-cols-1 gap-4 md:items-stretch flex-wrap justify-center w-full md:6/12 lg:w-5/12 m-auto">
          <Card
            title="Västra Sidans Stadgar"
            titleClassName="text-center !text-2xl"
            className="order-2 md:order-1"
          >
            {orgChart.chart.map(({ text, title }) => (
              <div key={title}>
                <p className="font-semibold text-lg mb-2">{title}</p>
                <Wysiwyg content={text} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  )
}

export default Stadgar;

export async function getStaticProps() {
  const ssrHelper = await createSSRHelper();

  await ssrHelper.wordpress.getAboutUsPage.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 3600 * 24,
  }
}
