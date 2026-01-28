import { prisma } from "~/server/db";
import { friendlyMembershipNames } from "../membership";
import { StripePaymentStatus } from "@prisma/client";

type ActiveMember = Awaited<ReturnType<typeof getActiveMember>>;

const extractFamilyMembers = (member: NonNullable<ActiveMember>) => {
  // Family member, but not the owner
  if (member.familyMemberShipOwner) {
    return [
      member.familyMemberShipOwner,
      ...member.familyMemberShipOwner.familyMembers
    ]
      .filter((familyMember) => familyMember.id !== member.id)
      .map((familyMember) => {
        return {
          id: familyMember.id,
          name: familyMember.firstName + " " + familyMember.lastName,
          email: familyMember.email,
          phone: familyMember.phone
        };
      });
  }

  // Family member owner
  if (member.familyMembers.length) {
    return member.familyMembers.map((familyMember) => {
      return {
        id: familyMember.id,
        name: familyMember.firstName + " " + familyMember.lastName,
        email: familyMember.email,
        phone: familyMember.phone
      };
    });
  }
};

export const formatActiveMember = (member: NonNullable<ActiveMember>) => {
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
    token: member.memberToken,
    ownerId: member.familyMemberShipOwnerId ?? member.id,
    familyMembers:
      friendlyMembershipNames[activeMembership.type] === "Familjemedlemskap"
        ? extractFamilyMembers(member)
        : null,
    activeMembership: {
      type: friendlyMembershipNames[activeMembership.type],
      becameMemberAt:
        stripePayment?.createdAt ?? new Date("1997-04-29T00:00:00Z"),
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
      familyMembers: true,
      familyMemberShipOwner: {
        include: {
          familyMembers: true
        }
      },
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
