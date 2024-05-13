import { format } from "date-fns";
import { type GetStaticPropsContext } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import Accordion from "~/components/atoms/Accordion/Accordion";
import { awayGameRules } from "~/components/atoms/Accordion/accordionContent";
import { AwayGameForm } from "~/components/common/AwayGameForm/AwayGameForm";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const BusPage = () => {
  const { id } = useRouter().query;
  const { data: game, isLoading: isLoadingGame } = api.public.getAwayGame.useQuery({ id: id as string });

  if (!game || isLoadingGame) return null;


  return (
    <>
      <Head>
        <title>{game.name} | Västra Sidan</title>
        <meta name="description" key="description" content={game.description} />
      </Head>
      <div className="flex flex-col items-center justify-center gap-6">
        <h1 className="text-center text-4xl md:text-5xl font-extrabold tracking-tight text-white sm:text-5xl">
          {game.name}
        </h1>
        <p className="text-3xl">
          Bussen avgår {formatSwedishTime(game.date, "HH:mm")}
        </p>
        <Accordion
          items={[
            awayGameRules,
            {
              title: 'Bussinfo',
              content: game.description
            },
            {
              title: 'Priser',
              content: (
                <div className="space-y-1">
                  <p className="text-sm">Pris vuxen medlem: {game.memberPrice} kr</p>
                  <p className="text-sm">Pris vuxen icke medlem: {game.defaultPrice} kr</p>
                  <p className="text-sm">Pris ungdom medlem: {game.youthMemberPrice} kr</p>
                  <p className="text-sm">Pris ungdom icke medlem: {game.youthPrice} kr</p>
                </div>
              )
            }
          ]}
          className="w-full space-y-6" 
          />
        <AwayGameForm />
      </div>
    </>
  )
};

export default BusPage;

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: "blocking"
  };
};

export const getStaticProps = async (props: GetStaticPropsContext) => {
  const id = props.params?.id as string;
  if (!id) {
    return { notFound: true };
  }
  const ssrHelper = await createSSRHelper();
  const game = await ssrHelper.public.getAwayGame.fetch({ id });
  if (!game) {
    return { notFound: true };
  }
  return {
    props: {
      trpcState: ssrHelper.dehydrate(),
    },
    revalidate: 60
  };
};