import { type GetStaticPropsContext } from "next";
import { useRouter } from "next/router";
import Card from "~/components/atoms/CardLink/CardLink";
import { Wysiwyg } from "~/components/atoms/Wysiwyg/Wysiwyg";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";

export default function ChroniclesPage() {
  const { id } = useRouter().query;
  const { data } = api.wordpress.getChronicleBySlug.useQuery({ slug: id as string }, { enabled: !!id });
  if (!data) {
    return null;
  }
  const { date, chronicle, slug } = data;

  return (
    <div>
      <Card 
        key={slug} 
        title={chronicle.title}
        titleClassName="text-center !text-3xl"
        className="w-full md:w-7/12 m-auto" 
        contentClassName="justify-start"
      >
        <p className="text-gray-400">{date}</p>
        <Wysiwyg content={chronicle.text} />
      </Card>
    </div>
  );
}

export const getStaticPaths = async () => {
  const ssrHelper = await createSSRHelper();
  const chronicles = await ssrHelper.wordpress.getChronicles.fetch();
  const paths = chronicles?.map(({ slug }) => ({ params: { id: slug } }));
  return {
    paths,
    fallback: false
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
    }
  };
};