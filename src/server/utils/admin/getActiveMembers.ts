import { prisma } from "~/server/db"
import { friendlyMembershipNames } from "../membership";

export type ActiveMember = Awaited<ReturnType<typeof getActiveMembers>>[number];

export const adminMemberFormatter = (member: ActiveMember) => {
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
      name: activeMembership.name,
      type: friendlyMembershipNames[activeMembership.type],
      becameMemberAt: activeMembership.createdAt,
      startDate: activeMembership.startDate,
      endDate: activeMembership.endDate,
    },
  }
}


export const getActiveMembers = async () => {
  const today = new Date();
  const res = await prisma.member.findMany({
    include: {
      memberships: true,
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
}