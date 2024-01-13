import { type inferRouterOutputs } from "@trpc/server";
import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

type AwayGuide = inferRouterOutputs<AppRouter>['wordpress']['getAwayGuideBySlug']['awayGuide'];

const AwayGuideTable = (awayGuide: AwayGuide) => {

  const rows = [
    {
      label: 'Lag:',
      value: awayGuide.lag
    },
    {
      label: 'Bildad:',
      value: awayGuide.bildad
    },
    {
      label: 'Sport:',
      value: awayGuide.sport
    },
    {
      label: 'Meriter:',
      value: (
        <p dangerouslySetInnerHTML={{ __html: awayGuide.meriter }}></p>
      )
    },
    {
      label: 'Hemsida:',
      value: (
        <Link className="underline" href={awayGuide.hemsida}>{awayGuide.hemsida}</Link>
      )
    },
    {
      label: 'Avstånd:',
      value: awayGuide.avstand,
    },
    {
      label: 'Matcher:',
      value: awayGuide.matcher,
    },
    {
      label: 'Division:',
      value: awayGuide.division,
    },
    {
      label: 'Färger:',
      value: awayGuide.farger
    }
  ]


  return (
    <div className="grid grid-cols-1 xl:grid-cols-2">
      <table className="order-2 xl:order-1">
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className={`bg-slate-${index % 2 ? '600' : '700'}`}>
              <td className="font-semibold w-24 p-2">{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-center order-1 xl:order-2">
        <Image src={awayGuide.logo.sourceUrl} width={200} height={200} alt={awayGuide.lag} />
      </div>
    </div>
  )
};

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
          <AwayGuideTable {...awayGuide} />
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
    },
    revalidate: 3600 * 24,
  };
};