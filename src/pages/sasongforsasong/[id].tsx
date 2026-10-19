import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import {
  createSSRHelper,
  isNotFoundError,
  NOT_FOUND_REVALIDATE
} from "~/utils/createSSRHelper";

export default function SeasonChroniclePage() {
  const { id } = useRouter().query;
  const { data } = api.wordpress.getSeasonChronicleBySlug.useQuery({ slug: id as string }, { enabled: !!id, staleTime: Infinity });
  if (!data) {
    return null;
  }
  const { date, title, slug, text, author } = data;

  const textWithoutHtml = text.replace(/<[^>]*>?/gm, '');

  const seoTitle = `${title} | Västra Sidan`;
  const seoDescription = textWithoutHtml.length > 160 ? textWithoutHtml.substring(0, 160) : textWithoutHtml;

  return (
    <>
      <Head>
        <title>{seoTitle}</title>
        <meta name="title" key="title" content={seoTitle} />
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
          <div>
            {!!author && (
              <p className="text-gray-400">{author}</p>
            )}
            <p className="text-gray-400">{date}</p>
          </div>
          <Wysiwyg content={text} />
        </Card>
      </div>
    </>
  );
}

export const getStaticPaths = async () => {
  // TEMP disable SSR
  return {
    paths: [],
    fallback: "blocking"
  }
  const ssrHelper = createSSRHelper();
  const chronicles = await ssrHelper.wordpress.getSeasonChronicles.fetch();
  const paths = chronicles.slugs?.map((slug) => ({ params: { id: slug } }));
  return {
    paths,
    fallback: "blocking"
  };
};

export const getStaticProps = async (props: GetStaticPropsContext) => {
  const slug = props.params?.id as string;
  if (!slug) {
    return { notFound: true };
  }
  const ssrHelper = createSSRHelper();
  try {
    await ssrHelper.wordpress.getSeasonChronicleBySlug.fetch({ slug });
  } catch (err) {
    if (isNotFoundError(err)) {
      return { notFound: true, revalidate: NOT_FOUND_REVALIDATE };
    }
    throw err;
  }
  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 3600 * 24
  };
};