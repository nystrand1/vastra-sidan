import { type inferRouterOutputs } from "@trpc/server";
import { type GetStaticPropsContext, type InferGetStaticPropsType } from "next";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { env } from "~/env.mjs";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { createSSRHelper } from "~/utils/createSSRHelper";


export const MemberCard = dynamic(() => import('~/components/common/MemberCard/MemberCard'), {
  ssr: false,
  loading: () => <div className="flex justify-center">Laddar...</div>
});

type ActiveMembership = NonNullable<inferRouterOutputs<AppRouter>['member']['getMember']>['activeMemberships'][0]

export const MemberPage = ({ memberToken }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { data, isLoading } = api.member.getMember.useQuery({ memberToken }, { enabled: !!memberToken });
  const [flipped, setFlipped] = useState(false);
  const [activeMembership, setActiveMembership] = useState<ActiveMembership>();

  useEffect(() => {
    if (data?.activeMemberships.length) {
      const activeMembership = data.activeMemberships[0];
      setActiveMembership(activeMembership);
    }
  }, [data]);

  if (!data && !isLoading) {
    return <div className="flex justify-center">Laddar...</div>
  }

  if (!data) {
    return <div className="flex justify-center">Medlemmen hittades inte</div>
  }

  const hasActiveMemberships = data.activeMemberships.length > 0;
  const hasExpiredMemberships = data.expiredMemberships.length > 0;


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
        <div className="m-auto bottom-0 absolute w-52 md:w-64">
          <Button className="text-center w-full" onClick={() => setFlipped(!flipped)}>
            {flipped ? 'Vänd tillbaka' : 'Vänd'}
          </Button>
          {data.activeMemberships.length > 1 && (
            <div>
              <SelectField 
                label=""
                defaultValue={activeMembership.id}
                onChange={((e) => {
                  const membership = data.activeMemberships.find((x) => x.id === e.target.value);
                  if (membership) {
                    setActiveMembership(membership);
                  }
                })}
                options={data.activeMemberships.map((x) => ({
                  value: x.id,
                  label: x.name,
                }))}>
                {activeMembership.name}
              </SelectField>
            </div>
          )}
        </div>
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