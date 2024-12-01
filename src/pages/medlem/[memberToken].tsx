import { type GetStaticPropsContext, type InferGetStaticPropsType } from "next";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "~/components/atoms/Button/Button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import { env } from "~/env.mjs";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const MemberCard = dynamic(() => import('~/components/common/MemberCard/MemberCard'), {
  ssr: false,
  loading: () => <div className="flex justify-center">Laddar...</div>
});

export const MemberPage = ({ memberToken }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { data, isLoading } = api.member.getMember.useQuery({ memberToken }, { enabled: !!memberToken });
  const [flipped, setFlipped] = useState(false);
  if (isLoading) {
    return <div className="flex justify-center">Laddar...</div>
  }

  if (!data) {
    return <div className="flex justify-center">Medlemmen hittades inte</div>
  }

  const hasActiveMemberships = data.activeMemberships.length > 0;
  const hasExpiredMemberships = data.expiredMemberships.length > 0;

  const activeMembership = data.activeMemberships[0];

  if (!hasActiveMemberships && !hasExpiredMemberships) {
    return (
      <div className="flex justify-center">
        <p>Du har inget medlemskap</p>
      </div>
    )
  }

  if (!activeMembership) {
    return (
      <div>
        <p>Du har inget aktivt medlemskap</p>
        <ButtonLink href="/bli-medlem">Bli medlemskap</ButtonLink>
      </div>
    )
  }

  return (
    <div>
      <div className="absolute inset-0 w-screen -mt-10 md:mt-0 h-[100vh] md:w-screen md:h-[100vh] m-auto overflow-hidden flex justify-center items-center flex-col">
        <MemberCard
          {...activeMembership}
          memberName={data.name}
          flipped={flipped}
          imageUrl={`${env.NEXT_PUBLIC_WEBSITE_URL}/_next/image?url=${encodeURIComponent(activeMembership.imageUrl)}&w=640&q=75`}
        />
        <Button className="text-center m-auto bottom-6 absolute w-32" onClick={() => setFlipped(!flipped)}>
          {flipped ? 'Vänd tillbaka' : 'Vänd'}
        </Button>
      </div>
    </div>
  )
}

export default MemberPage;

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export const getStaticProps = async (context: GetStaticPropsContext) => {
  const { memberToken } = context.params as { memberToken: string };

  if (!memberToken) {
    return {
      notFound: true,
    }
  }

  const ssg = await createSSRHelper();

  const member = await ssg.member.getMember.fetch({ memberToken });

  if (!member) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      memberToken,
      trpcState: ssg.dehydrate(),
    },
    revalidate: 3600,
  }
}