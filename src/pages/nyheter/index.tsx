import Head from "next/head";
import Image from "next/image";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function NewsPage() {
  const { data: news } = api.wordpress.getNews.useQuery();
  if (!news) {
    return <p className="text-center text-xl">Finns inga nyheter för tillfället!</p>
  }

  const seoDescription = "Senaste nytt kring Västra Sidan.";

  return (
    <>
      <Head>
        <title>Nyheter | Västra Sidan</title>
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <h1 className="text-center mb-4 text-5xl">Nyheter</h1>
        <div className="grid md:grid-cols-3 md:w-10/12 m-auto gap-4 md:items-stretch flex-wrap justify-center">
          {news?.map(({ slug, title, date, excerpt, image, author  }) => (
            <Card title={title} key={slug} contentClassName="justify-start">
              <div className="relative aspect-video rounded-md overflow-hidden">
                {image ? (
                  <Image className="object-cover" src={image.sourceUrl} alt={image.altText} fill />
                ) : (
                  <Image className="object-contain" src="/static/logo.png" alt="Västra Sidan logo" fill />
                )}
              </div>
              <div className="flex flex-col">
                <p className="text-gray-400">{date}</p>
                <p className="text-gray-400">{author}</p>
              </div>
              <Wysiwyg content={excerpt} />
              <ButtonLink className="justify-end" href={`/nyheter/${slug}`}>Läs mer</ButtonLink>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

export const getStaticProps = async () => {
  const ssrHelper = await createSSRHelper();
  await ssrHelper.wordpress.getNews.prefetch();

  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 60,
  }
};