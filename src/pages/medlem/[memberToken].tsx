import { type InferGetStaticPropsType, type GetStaticPropsContext } from "next"
import Image from "next/image";
import { twMerge } from "tailwind-merge";
import Card from "~/components/atoms/CardLink/CardLink";
import MemberCard from "~/components/common/MemberCard/MemberCard";
import { api } from "~/utils/api"
import { formatSwedishTime } from "~/utils/formatSwedishTime";



export const MemberPage = ({ memberToken }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { data, isLoading } = api.member.getMember.useQuery({ memberToken });

  if (isLoading) {
    return <div>Laddar...</div>
  }

  if (!data) {
    return <div>Medlemmen hittades inte</div>
  }

  const hasActiveMemberships = data.activeMemberships.length > 0;
  const hasExpiredMemberships = data.expiredMemberships.length > 0;

  if (!hasActiveMemberships && !hasExpiredMemberships) {
    return (
      <div>
        <p>Du har inget medlemskap</p>
      </div>
    )
  }

  return (
    <div>
      <div className="w-screen h-96 md:w-[600px] md:h-[600px] m-auto">
        <MemberCard />
      </div>
      <p className="text-3xl text-center md:mb-10 w-full">{data.name}</p>
      <div className={twMerge("grid gap-10 justify-center grid-cols-1", hasExpiredMemberships ? 'md:grid-cols-2' : 'md:grid-cols-none')}>
        <div className="md:flex flex-col justify-self-end space-y-2">
          <h2 className="text-2xl text-center">Aktiva medlemskap</h2>
          {data.activeMemberships.map((membership) => (
            <Card className="md:w-fit" key={membership.id}>
              <p>{membership.name}</p>
              <p>{membership.type}</p>
              <p>Giltigt till {formatSwedishTime(membership.expiresAt, 'dd MMMM yyyy')}</p>
              <Image src={membership.imageUrl} width={100} height={100} alt={membership.name} />
            </Card>
          ))}
        </div>
        {data.expiredMemberships.length > 0 && (
          <div className="flex flex-col justify-self-start space-y-2">
            <h2 className="text-2xl text-center">Tidigare medlemskap</h2>
            {data.expiredMemberships.map((membership) => (
              <Card className="w-fit" key={membership.id}>
                <p>{membership.name}</p>
                <p>{membership.type}</p>
                <p>Giltigt till {formatSwedishTime(membership.expiresAt, 'dd MMMM yyyy')}</p>
                <Image src={membership.imageUrl} width={100} height={100} alt={membership.name} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MemberPage;

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: "blocking",
  }
}

export const getStaticProps = (context: GetStaticPropsContext) => {
  const { memberToken } = context.params as { memberToken: string };

  if (!memberToken) {
    return {
      notFound: true,
    }
  }



  return {
    props: {
      memberToken
    },
  }
}