import { type inferRouterOutputs } from "@trpc/server";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { ButtonLink } from "~/components/atoms/ButtonLink/ButtonLink";
import { SelectField } from "~/components/atoms/SelectField/SelectField";
import { env } from "~/env.mjs";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";

export const MemberCard = dynamic(
  () => import("~/components/common/MemberCard/MemberCard"),
  {
    ssr: false,
    loading: () => <div className="flex justify-center">Laddar...</div>
  }
);

type ActiveMembership = NonNullable<
  inferRouterOutputs<AppRouter>["member"]["getMember"]
>["activeMemberships"][0];

/**
 * Rendered in the browser only: a member's page holds personal data, so it
 * must never end up in the CDN cache.
 */
export const MemberPage = () => {
  const { memberToken } = useRouter().query as { memberToken?: string };
  const { data, isPending } = api.member.getMember.useQuery(
    { memberToken: memberToken ?? "" },
    { enabled: !!memberToken }
  );
  const [flipped, setFlipped] = useState(false);
  const [activeMembership, setActiveMembership] = useState<ActiveMembership>();

  useEffect(() => {
    if (data?.activeMemberships.length) {
      const activeMembership = data.activeMemberships[0];
      setActiveMembership(activeMembership);
    }
  }, [data]);

  // Also pending while the router has no token yet
  if (isPending) {
    return <div className="flex justify-center">Laddar...</div>;
  }

  if (!data) {
    return <div className="flex justify-center">Medlemmen hittades inte</div>;
  }

  const hasActiveMemberships = data.activeMemberships.length > 0;
  const hasExpiredMemberships = data.expiredMemberships.length > 0;

  if (!hasActiveMemberships && !hasExpiredMemberships) {
    return (
      <div className="flex justify-center">
        <p>Du har inget medlemskap</p>
      </div>
    );
  }

  if (!activeMembership) {
    return (
      <div>
        <p>Du har inget aktivt medlemskap</p>
        <ButtonLink href="/bli-medlem">Bli medlemskap</ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <div className="absolute inset-0 m-auto -mt-10 flex h-[100vh] w-screen flex-col items-center justify-center overflow-hidden md:mt-0 md:h-[100vh] md:w-screen">
        <MemberCard
          {...activeMembership}
          memberName={data.name}
          flipped={flipped}
          imageUrl={`${env.NEXT_PUBLIC_WEBSITE_URL}/_next/image?url=${encodeURIComponent(activeMembership.imageUrl)}&w=640&q=75`}
        />
        <div className="absolute bottom-8 m-auto w-52 md:w-64">
          <Button
            className="w-full text-center"
            onClick={() => setFlipped(!flipped)}
          >
            {flipped ? "Vänd tillbaka" : "Vänd"}
          </Button>
          {data.activeMemberships.length > 1 && (
            <div>
              <SelectField
                label=""
                defaultValue={activeMembership.id}
                onChange={(e) => {
                  const membership = data.activeMemberships.find(
                    (x) => x.id === e.target.value
                  );
                  if (membership) {
                    setActiveMembership(membership);
                  }
                }}
                options={data.activeMemberships.map((x) => ({
                  value: x.id,
                  label: x.name
                }))}
              >
                {activeMembership.name}
              </SelectField>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberPage;
