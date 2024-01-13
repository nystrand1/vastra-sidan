import Head from "next/head";
import Image from "next/image";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function NewsPage() {
  const { data: news } = api.wordpress.getNews.useQuery(undefined, { staleTime: Infinity });
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
        <div className="grid md:w-10/12 m-auto gap-4 justify-center">
          {news?.map(({ slug, title, date, excerpt, image, author  }) => (
            <Card key={slug} titleClassName="text-center" contentClassName="md:!grid md:!grid-cols-2 md:gap-4 md:space-y-0">
              <div className="relative aspect-video rounded-md overflow-hidden md:order-2 md:my-auto">
                {image ? (
                  <Image className="object-cover" src={image.sourceUrl} alt={image.altText} fill />
                ) : (
                  <Image className="object-contain" src="/static/logo.png" alt="Västra Sidan logo" fill />
                )}
              </div>
              <div className="flex flex-col space-y-4">
                <h2 className="text-2xl font-semibold text-center">{title}</h2>
                <div className="md:flex md:flex-row md:justify-between">
                  <p className="text-gray-400">{date}</p>
                  <p className="text-gray-400 !mt-0">{author}</p>
                </div>
                <Wysiwyg content={excerpt} />
                <ButtonLink className="justify-end md:w-96 md:m-auto" href={`/nyheter/${slug}`}>Läs mer</ButtonLink>
              </div>
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