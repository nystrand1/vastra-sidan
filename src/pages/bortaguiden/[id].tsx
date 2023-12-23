import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function AwayGamePage() {
  const { id } = useRouter().query;
  const { data } = api.wordpress.getAwayGuideBySlug.useQuery({ slug: id as string }, { enabled: !!id });
  if (!data) {
    return null;
  }
  const { date, awayGuide, awayGuideContent, slug, title } = data;
  const { text } = awayGuideContent;

  const textWithoutHtml = text.replace(/<[^>]*>?/gm, '');

  const seoDescription = textWithoutHtml.length > 160 ? textWithoutHtml.substring(0, 160) : textWithoutHtml;

  return (
    <>
    <Head>
      <title>{title}</title>
      <meta name="title" key="title" content={title} />
      <meta name="description" key="description" content={seoDescription} />
      {awayGuide.logo?.sourceUrl && (
        <meta property="image" key="image" content={awayGuide.logo.sourceUrl} />
      )}
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
          <p className="text-gray-400">{date}</p>
          <Wysiwyg content={awayGuideContent.text} />
        </Card>
      </div>
    </>
  );
}

export const getStaticPaths = async () => {
  const ssrHelper = await createSSRHelper();
  const awayGames = await ssrHelper.wordpress.getAwayGuides.fetch();
  const paths = awayGames.slugs?.map((slug) => ({ params: { id: slug } }));
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
  const chronicle = await ssrHelper.wordpress.getAwayGuideBySlug.fetch({ slug });
  if (!chronicle) {
    return { notFound: true };
  }
  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    }
  };
};