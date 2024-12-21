import { type Member } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "~/server/db";

interface AttachMembershipToMembersInput {
  membershipId?: string;
  members: Member[];
}

export const attachMembershipToMembers = async ({
  membershipId,
  members
} : AttachMembershipToMembersInput) => {
  if (!membershipId) {
    throw new TRPCError({
      message: "Missing membershipId",
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
  return await prisma.membership.update({
    where: {
      id: membershipId
    },
    data: {
      members: {
        connect: members.map(member => ({ id: member.id }))
      }
    }
  });
}