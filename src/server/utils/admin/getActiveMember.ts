import { prisma } from "~/server/db";
import { friendlyMembershipNames } from "../membership";
import { StripePaymentStatus } from "@prisma/client";

type ActiveMember = Awaited<ReturnType<typeof getActiveMember>>;

export const formatActiveMember = (member: NonNullable<ActiveMember>) => {
  const [activeMembership] = member.memberships;
  const [stripePayment] = member.stripePayments;
  if (!activeMembership) {
    throw new Error("Member has no active membership");
  }

  if (!stripePayment) {
    throw new Error("Member has no active payment");
  }
  return {
    id: member.id,
    name: member.firstName + " " + member.lastName,
    email: member.email,
    phone: member.phone,
    token: member.memberToken,
    activeMembership: {
      type: friendlyMembershipNames[activeMembership.type],
      becameMemberAt: stripePayment.createdAt,
      startDate: activeMembership.startDate,
      endDate: activeMembership.endDate
    }
  };
};

export const getActiveMember = async (id: string) => {
  const today = new Date();
  const res = await prisma.member.findFirst({
    include: {
      memberships: true,
      stripePayments: {
        where: {
          status: StripePaymentStatus.SUCCEEDED
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    },
    where: {
      id: id,
      memberships: {
        some: {
          endDate: {
            gte: today
          },
          startDate: {
            lte: today
          }
        }
      }
    }
  });

  return res;
};
