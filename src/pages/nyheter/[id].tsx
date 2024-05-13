import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function NewsPage() {
  const { id } = useRouter().query;
  const { data } = api.wordpress.getNewsBySlug.useQuery({ slug: id as string }, { enabled: !!id, staleTime: Infinity });
  if (!data) {
    return null;
  }
  const { date, title, slug, image, text, author } = data;

  const textWithoutHtml = text.replace(/<[^>]*>?/gm, '');

  const seoDescription = textWithoutHtml.length > 160 ? textWithoutHtml.substring(0, 160) : textWithoutHtml;

  return (
    <>
      <Head>
        <title>{title} | Västra Sidan</title>
        <meta name="title" key="title" content={title} />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <Card 
          key={slug} 
          title={title}
          titleClassName="text-center !text-3xl"
          className="w-full md:w-7/12 m-auto" 
          contentClassName="justify-start"
          titleAsH1
        >
          <div className="relative aspect-video rounded-md overflow-hidden">
            {image ? (
              <Image className="object-cover" src={image.sourceUrl} alt={image.altText} fill />
            ) : (
              <Image className="object-contain" src="/static/logo.png" alt="Västra Sidan logo" fill />
            )}
          </div>
          <div>
            <p className="text-gray-400">{date}</p>
            <p className="text-gray-400">{author}</p>
          </div>
          <Wysiwyg content={text} />
        </Card>
      </div>
    </>
  );
}

export const getStaticPaths = async () => {

  const ssrHelper = await createSSRHelper();
  const news = await ssrHelper.wordpress.getNews.fetch();
  const paths = news?.map(({ slug }) => ({ params: { id: slug } }));
  return {
    paths,
    fallback: "blocking"
  };
};

export const getStaticProps = async (props: GetStaticPropsContext ) => {
  const slug = props.params?.id as string;
  if (!slug) {
    return { notFound: true };
  }
  const ssrHelper = await createSSRHelper();
  const news = await ssrHelper.wordpress.getNewsBySlug.fetch({ slug });
  if (!news) {
    return { notFound: true };
  }
  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 300,
  };
};