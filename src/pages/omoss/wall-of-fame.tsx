


import Head from "next/head";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const WallOfFame = () => {
  const { data } = api.wordpress.getWallOfFamePage.useQuery();

  if (!data) return null;

  const { awardInfo, kjelledine, tioRyssar } = data;

  const seoDescription = 'Västra Sidans medlemmar röstar på varje årsmöte fram den gångna fotboll- och bandysäsongens skönaste spelare. Fotbollspriset heter "Årets Kjelledine" och har delats ut sedan 2004. Bandypriset heter "10 Ryssar-priset" och har delats ut sedan 2009.'

  return (
    <>
      <Head>
        <title>Wall of fame | Västra Sidan</title>
        <meta name="title" key="title" content="Wall of fame | Västra Sidan" />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Wall of fame</h1>
        <div className="md:max-w-lg m-auto text-lg mb-4">
          <Wysiwyg content={awardInfo} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-wrap justify-center w-full lg:w-7/12 m-auto">
          {[kjelledine, tioRyssar].map((x, i) => (
            <Card
              key={i === 0 ? "Årets Kjelledine" : "Tio ryssar"}
              title={i === 0 ? "Årets Kjelledine" : "Tio ryssar"}
              titleClassName="text-center !text-2xl"
              className="order-2 md:order-1"
            >
              <ul className="divide-y-2">
                {x.map(({ winner, year }) => (
                  <li key={`${winner}-${year}`} className="flex justify-between pt-2">
                    <p className="font-semibold text-lg mb-2">{year}</p>
                    <p className="font-semibold text-lg mb-2">{winner}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}

export default WallOfFame;

export async function getStaticProps() {
  const ssrHelper = await createSSRHelper();

  await ssrHelper.wordpress.getWallOfFamePage.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 300,
  }
}
