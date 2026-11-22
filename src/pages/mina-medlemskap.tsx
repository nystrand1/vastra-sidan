import { type inferRouterOutputs } from "@trpc/server";
import Error from "next/error";
import Link from "next/link";
import Card from "~/components/atoms/CardLink/CardLink";
import { type AppRouter } from "~/server/api/root";
import { api } from "~/utils/api";
import { useAppSession } from "~/utils/authClient";
import { featureFlags } from "~/utils/featureFlags";
import { formatSwedishTime } from "~/utils/formatSwedishTime";
import LoginPage from "./loggain";

type MembershipCard =
  inferRouterOutputs<AppRouter>["user"]["getMyMemberships"]["family"][number]["memberships"][number];

const isEnabled = featureFlags.ENABLE_LOGIN && featureFlags.ENABLE_MEMBERSHIPS;

const MembershipItem = ({
  membership,
  memberToken
}: {
  membership: MembershipCard;
  memberToken?: string;
}) => (
  <Card
    title={membership.name}
    badge={membership.type}
    className="w-full md:w-96"
  >
    <p>Giltigt till: {formatSwedishTime(membership.expiresAt, "yyyy-MM-dd")}</p>
    {memberToken && (
      <Link
        className="block font-semibold underline"
        href={`/medlem/${memberToken}`}
      >
        Visa medlemskort
      </Link>
    )}
  </Card>
);

export const MembershipsPage = () => {
  const { user, isPending } = useAppSession();
  const { data, isError } = api.user.getMyMemberships.useQuery(undefined, {
    enabled: isEnabled && !!user
  });

  if (!isEnabled) {
    return <Error statusCode={404} />;
  }

  if (isPending) {
    return <p className="text-center">Laddar...</p>;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (isError) {
    return (
      <p className="text-center">
        Det gick inte att hämta dina medlemskap. Försök igen senare.
      </p>
    );
  }

  if (!data) {
    return <p className="text-center">Laddar...</p>;
  }

  const { own, family } = data;
  if (
    !own ||
    (own.active.length === 0 && own.expired.length === 0 && family.length === 0)
  ) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p>Du har inga medlemskap.</p>
        <Link className="font-semibold underline" href="/bli-medlem">
          Bli medlem
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      <section className="flex w-full flex-col items-center gap-4">
        <h2 className="text-2xl font-semibold">Aktiva medlemskap</h2>
        {own.active.length === 0 ? (
          <p>Du har inga aktiva medlemskap.</p>
        ) : (
          own.active.map((m) => (
            <MembershipItem
              key={m.id}
              membership={m}
              memberToken={own.memberToken}
            />
          ))
        )}
      </section>
      {own.expired.length > 0 && (
        <section className="flex w-full flex-col items-center gap-4">
          <h2 className="text-2xl font-semibold">Tidigare medlemskap</h2>
          {own.expired.map((m) => (
            <MembershipItem key={m.id} membership={m} />
          ))}
        </section>
      )}
      {family.length > 0 && (
        <section className="flex w-full flex-col items-center gap-4">
          <h2 className="text-2xl font-semibold">Familj</h2>
          {family.map((f, i) => (
            <div
              key={`${i}-${f.name}`}
              className="flex w-full flex-col items-center gap-4"
            >
              <h3 className="text-xl font-semibold">{f.name}</h3>
              {f.memberships.map((m) => (
                <MembershipItem key={m.id} membership={m} />
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default MembershipsPage;
