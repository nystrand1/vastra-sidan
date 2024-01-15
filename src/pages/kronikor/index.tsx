import Head from "next/head";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function ChroniclesPage() {
  const { data: chronicles } = api.wordpress.getChronicles.useQuery(undefined, { staleTime: Infinity });
  if (!chronicles) {
    return <p className="text-center text-xl">Finns inga kronikor för tillfället!</p>
  }

  const seoDescription = "Läs Martin Erlandsson Lampa's krönikor om allt som rör Västra Sidan.";

  return (
    <>
      <Head>
        <title>Krönikor | Västra Sidan</title>
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Krönikor</h1>
        <div className="grid md:grid-cols-3 gap-4 md:items-stretch">
          {chronicles?.map(({ slug, chronicle, date, excerpt }) => (
            <Card title={chronicle.title} key={slug} contentClassName="justify-start">
              <p className="text-gray-400">{date}</p>
              <Wysiwyg content={excerpt} />
              <ButtonLink className="justify-end" href={`/kronikor/${slug}`}>Läs mer</ButtonLink>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  await ssrHelper.wordpress.getChronicles.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 3600 * 24,
  }
};