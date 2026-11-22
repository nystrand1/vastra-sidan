import {
  type PrismaClient,
  StripePaymentStatus
} from "~/generated/prisma/client";
import { isPayer } from "~/server/utils/accounts/bookingAccess";
import {
  type MembershipCard,
  splitMemberships,
  toMembershipCard
} from "~/server/utils/membership";

export type MyMemberships = {
  own: {
    memberToken: string;
    active: MembershipCard[];
    expired: MembershipCard[];
  } | null;
  /** No member tokens: anyone can name an existing member as family, so a token would leak their card. */
  family: {
    name: string;
    memberships: MembershipCard[];
  }[];
};

/**
 * The signed-in user's own memberships, plus the family memberships they paid for.
 *
 * A membership purchase is stored as a SUCCEEDED StripePayment linked to every member it buys
 * for, and records the Membership it bought in `membershipId`. For each payment the viewer paid
 * for, every other member on it is shown with exactly that membership, if they hold it. Nothing
 * else about them, and not `familyMemberShipOwnerId`, which is rewritten each season.
 *
 * A payment without a recorded payer or membership shows the viewer nothing but their own
 * memberships.
 */
export const getMyMemberships = async (
  prisma: PrismaClient,
  email: string
): Promise<MyMemberships> => {
  const member = await prisma.member.findUnique({
    where: { email },
    include: {
      memberships: true,
      stripePayments: {
        where: { status: StripePaymentStatus.SUCCEEDED },
        include: { members: { include: { memberships: true } } }
      }
    }
  });
  if (!member) {
    return { own: null, family: [] };
  }

  // One SUCCEEDED row per payment intent; key by intent so nothing is counted twice
  const payments = new Map(
    member.stripePayments.map((p) => [p.stripePaymentId, p])
  );

  const family = new Map<
    string,
    { name: string; memberships: Map<string, MembershipCard> }
  >();
  for (const payment of payments.values()) {
    if (!isPayer(email, payment.payerEmail) || !payment.membershipId) continue;
    for (const other of payment.members) {
      if (other.id === member.id) continue;
      const bought = other.memberships.find(
        (m) => m.id === payment.membershipId
      );
      if (!bought) continue;
      const entry = family.get(other.id) ?? {
        name: `${other.firstName} ${other.lastName}`,
        memberships: new Map<string, MembershipCard>()
      };
      entry.memberships.set(bought.id, toMembershipCard(bought));
      family.set(other.id, entry);
    }
  }

  return {
    own: {
      memberToken: member.memberToken,
      ...splitMemberships(member.memberships)
    },
    family: [...family.values()]
      .map((f) => ({
        name: f.name,
        memberships: [...f.memberships.values()].sort(
          (a, b) => b.expiresAt.getTime() - a.expiresAt.getTime()
        )
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"))
  };
};
