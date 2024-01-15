import Head from "next/head";
import Link from "next/link";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function SeasonBySeasonPage() {
  const { data: awayGuides } = api.wordpress.getSeasonChronicles.useQuery(undefined, { staleTime: Infinity });
  if (!awayGuides?.bandy || !awayGuides?.fotball) {
    return <p className="text-center text-xl">Finns inga säsongskrönikor för tillfället!</p>
  }

  const seoDescription = "Läs Martin Erlandsson Lampa's säsongkrönikor kring Sirius Bandy och Sirius Fotboll.";

  return (
    <>
      <Head>
        <title>Säsong för säsong | Västra Sidan</title>
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Säsong för säsong</h1>
        <div className="flex flex-col md:flex-row gap-4 md:items-stretch flex-wrap justify-center">
          <Card title="Fotboll" className="w-full md:w-96" titleClassName="!text-3xl">
            {awayGuides.fotball?.map((guide) => (
              <Link prefetch={false} className="ml-4 hover:text-gray-200" href={`/sasongforsasong/${guide.slug}`} key={`fotboll-${guide.seasonChronicleContent.title}`}>
                {guide.seasonChronicleContent.title}
              </Link>
            ))}
          </Card>
          <Card title="Bandy" className="w-full md:w-96" titleClassName="!text-3xl">
            {awayGuides.bandy?.map((guide) => (
              <Link prefetch={false} className="ml-4 hover:text-gray-200" href={`/sasongforsasong/${guide.slug}`} key={`bandy-${guide.seasonChronicleContent.title}`}>
                {guide.seasonChronicleContent.title}
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  await ssrHelper.wordpress.getSeasonChronicles.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 60,
  }
};