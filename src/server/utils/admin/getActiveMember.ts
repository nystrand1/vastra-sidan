import { prisma } from "~/server/db";
import { friendlyMembershipNames } from "../membership";


type ActiveMember = Awaited<ReturnType<typeof getActiveMember>>;

export const formatActiveMember = (member: NonNullable<ActiveMember>) => {
  const [activeMembership] = member.memberships;
  if (!activeMembership) {
    throw new Error("Member has no active membership");
  }
  return {
    id: member.id,
    name: member.firstName + " " + member.lastName,
    email: member.email,
    phone: member.phone,
    activeMembership: {
      type: friendlyMembershipNames[activeMembership.type],
      becameMemberAt: activeMembership.createdAt,
      startDate: activeMembership.startDate,
      endDate: activeMembership.endDate,
    },
  }
}

export const getActiveMember = async (id: string) => {
  const today = new Date();
  const res = await prisma.member.findFirst({
    include: {
      memberships: true,
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
}