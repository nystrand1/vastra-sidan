import Head from "next/head";
import Link from "next/link";
import Accordion from "~/components/atoms/Accordion/Accordion";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function AwayGuidePage() {
  const { data: awayGuides } = api.wordpress.getAwayGuides.useQuery();
  if (!awayGuides?.bandy || !awayGuides?.fotball) {
    return <p className="text-center text-xl">Finns inga bortaguider för tillfället!</p>
  }

  const seoDescription = "Läs Martin Erlandsson Lampa's gedigna bortaguider inom fotboll och bandy. Här finner du allt från division 7 upp till Allsvenskan & Elitserien.";

  return (
    <>
      <Head>
        <title>Bortaguiden | Västra Sidan</title>
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Bortaguiden</h1>
        <div className="flex flex-col md:flex-row gap-4 md:items-stretch flex-wrap justify-center">
          <Card title="Bandy" className="w-full md:w-96" titleClassName="!text-3xl">
            {awayGuides.bandy?.map((x) => (
              <Accordion
                key={`bandy-${x.division}`}
                items={[
                {
                  title: x.division,
                  className: 'md:w-full pl-0 py-2',
                  content: <div className="flex flex-col space-y-2">
                    {x.guides.map((guide) => (
                    <Link className="ml-4 hover:text-gray-200" href={`/bortaguiden/${guide.slug}`} key={guide.title}>
                      {guide.title}
                    </Link>
                  ))}
                  </div>
                }
              ]}
              />
            ))}
          </Card>
          <Card title="Fotboll" className="w-full md:w-96" titleClassName="!text-3xl">
            {awayGuides.fotball?.map((x) => (
              <Accordion
                key={`fotball-${x.division}`}
                items={[
                {
                  title: x.division,
                  className: 'md:w-full pl-0 py-2',
                  content: <div className="flex flex-col space-y-2">
                    {x.guides.map((guide) => (
                    <Link className="ml-4 hover:text-gray-200" href={`/bortaguiden/${guide.slug}`} key={guide.title}>
                      {guide.title}
                    </Link>
                  ))}
                  </div>
                }
              ]}
              />
            ))}
          </Card>
        
        </div>
      </div>
    </>
  );
}

export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  await ssrHelper.wordpress.getAwayGuides.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 60,
  }
};