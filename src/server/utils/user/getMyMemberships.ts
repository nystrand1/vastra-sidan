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
  family: {
    name: string;
    memberToken: string;
    memberships: MembershipCard[];
  }[];
};

/**
 * The signed-in user's own memberships, plus the family memberships they paid for.
 *
 * A membership purchase is stored as a SUCCEEDED StripePayment linked to every member it
 * buys for, and each of those members gets the purchased Membership. The payment does not
 * record which Membership it bought, so it is the one every member on the payment holds.
 * Only those are shown for the other members on the payment: nothing else about them, and
 * not `familyMemberShipOwnerId`, which is rewritten each season.
 *
 * Only the payer sees the rest of a payment's members. Payments made before `payerEmail` was
 * stored for memberships have none; for those the payer is the member the other members on
 * the payment currently point at.
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
    {
      name: string;
      memberToken: string;
      memberships: Map<string, MembershipCard>;
    }
  >();
  for (const payment of payments.values()) {
    const others = payment.members.filter((m) => m.id !== member.id);
    const paidByMe =
      payment.payerEmail !== null
        ? isPayer(email, payment.payerEmail)
        : member.familyMemberShipOwnerId === null &&
          others.some((m) => m.familyMemberShipOwnerId === member.id);
    if (!paidByMe) continue;
    const boughtTogether = member.memberships.filter((owned) =>
      payment.members.every((m) =>
        m.memberships.some((ms) => ms.id === owned.id)
      )
    );
    for (const other of others) {
      const entry = family.get(other.id) ?? {
        name: `${other.firstName} ${other.lastName}`,
        memberToken: other.memberToken,
        memberships: new Map<string, MembershipCard>()
      };
      for (const membership of boughtTogether) {
        entry.memberships.set(membership.id, toMembershipCard(membership));
      }
      family.set(other.id, entry);
    }
  }

  return {
    own: {
      memberToken: member.memberToken,
      ...splitMemberships(member.memberships)
    },
    family: [...family.values()]
      .filter((f) => f.memberships.size > 0)
      .map((f) => ({
        name: f.name,
        memberToken: f.memberToken,
        memberships: [...f.memberships.values()].sort(
          (a, b) => b.expiresAt.getTime() - a.expiresAt.getTime()
        )
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"))
  };
};
