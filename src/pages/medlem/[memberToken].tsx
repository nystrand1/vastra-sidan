import { type InferGetStaticPropsType, type GetStaticPropsContext } from "next"
import { friendlyMembershipNames } from "~/server/utils/membership";
import { api } from "~/utils/api"



export const MemberPage = ({ memberToken } : InferGetStaticPropsType<typeof getStaticProps>) => {
  const { data, isLoading } = api.member.getMember.useQuery({ memberToken });

  if (isLoading) {
    return <div>Laddar...</div>
  }

  if (!data) {
    return <div>Medlemmen hittades inte</div>
  }

  if (data.memberships.length === 0) {
    return (
      <div>
        <p>Du har inget medlemskap</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-3xl">Medlem</p>
      {data.memberships.map((membership) => (
        <div key={membership.id}>
          {membership.name} - {friendlyMembershipNames[membership.type]}
        </div>
      ))}
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