import { prisma } from "~/server/db";
import { friendlyMembershipNames } from "../membership";
import { StripePaymentStatus } from "@prisma/client";

export type ActiveMember = Awaited<ReturnType<typeof getActiveMembers>>[number];

export const adminMemberFormatter = (member: ActiveMember) => {
  const [activeMembership] = member.memberships;
  const [stripePayment] = member.stripePayments;
  if (!activeMembership) {
    throw new Error("Member has no active membership");
  }

  if (!stripePayment && activeMembership.type !== "HONORARY") {
    throw new Error("Member has no active payment");
  }
  return {
    id: member.id,
    name: member.firstName + " " + member.lastName,
    email: member.email,
    phone: member.phone,
    activeMembership: {
      name: activeMembership.name,
      type: friendlyMembershipNames[activeMembership.type],
      becameMemberAt:
        stripePayment?.createdAt ?? new Date("1997-04-29T00:00:00Z"),
      startDate: activeMembership.startDate,
      endDate: activeMembership.endDate
    }
  };
};

export const getActiveMembers = async () => {
  const today = new Date();
  const res = await prisma.member.findMany({
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
