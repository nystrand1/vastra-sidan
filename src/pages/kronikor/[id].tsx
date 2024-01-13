import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function ChroniclePage() {
  const { id } = useRouter().query;
  const { data } = api.wordpress.getChronicleBySlug.useQuery({ slug: id as string }, { enabled: !!id, staleTime: Infinity });
  if (!data) {
    return null;
  }
  const { date, chronicle, slug } = data;

  const textWithoutHtml = chronicle.text.replace(/<[^>]*>?/gm, '');

  const seoDescription = textWithoutHtml.length > 160 ? textWithoutHtml.substring(0, 160) : textWithoutHtml;

  return (
    <>
      <Head>
        <title>{chronicle.title}</title>
        <meta name="title" key="title" content={chronicle.title} />
        <meta name="description" key="description" content={seoDescription} />
      </Head>
      <div>
        <Card 
          key={slug} 
          title={chronicle.title}
          titleClassName="text-center !text-3xl"
          className="w-full md:w-7/12 m-auto" 
          contentClassName="justify-start"
          titleAsH1
        >
          <p className="text-gray-400">{date}</p>
          <Wysiwyg content={chronicle.text} />
        </Card>
      </div>
    </>
  );
}

export const getStaticPaths = async () => {
  const ssrHelper = await createSSRHelper();
  const chronicles = await ssrHelper.wordpress.getChronicles.fetch();
  const paths = chronicles?.map(({ slug }) => ({ params: { id: slug } }));
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
  const chronicle = await ssrHelper.wordpress.getChronicleBySlug.fetch({ slug });
  if (!chronicle) {
    return { notFound: true };
  }
  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 3600 * 24
  };
};