import Link from "next/link";
import Card from "~/components/atoms/CardLink/CardLink";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function AwayGuidePage() {
  const { data: awayGuides } = api.wordpress.getAwayGuides.useQuery();
  if (!awayGuides?.bandy || !awayGuides?.fotball) {
    return <p className="text-center text-xl">Finns inga bortaguider för tillfället!</p>
  }
  return (
    <div>
      <h1 className="text-center mb-4 text-5xl">Bortaguiden</h1>
      <div className="flex flex-col md:flex-row gap-4 md:items-stretch flex-wrap justify-center">
        <Card title="Bandy" className="w-full md:w-96">
          {awayGuides.bandy?.map((x) => (
            <>
              <p key={x.division} className="font-bold">{x.division}</p>
              {x.guides.map((guide) => (
                <Link className="ml-4 hover:text-gray-200" href={guide.slug} key={guide.title}>
                  {guide.title}
                </Link>
              ))}
            </>
          ))}
        </Card>
        <Card title="Fotboll" className="w-full md:w-96">
          {awayGuides.fotball?.map((x) => (
            <>
              <p key={x.division} className="font-bold">{x.division}</p>
              {x.guides.map((guide) => (
                <Link className="ml-4 hover:text-gray-200" href={guide.slug} key={guide.title}>
                  {guide.title}
                </Link>
              ))}
            </>
          ))}
        </Card>
       
      </div>
    </div>
  );
}

export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  await ssrHelper.wordpress.getAwayGuides.prefetch();

  return {
    props: {
      dehydratedState: ssrHelper.dehydrate(),
    },
    revalidate: 60,
  }
};