import { type Member, MembershipType } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "~/server/db";
import { linkFamilyMembers } from "~/server/utils/member/findOrCreateFamilyMembers";

interface AttachMembershipToMembersInput {
  membershipId?: string;
  membershipOwnerId?: string;
  members: Member[];
}

export const attachMembershipToMembers = async ({
  membershipId,
  membershipOwnerId,
  members
} : AttachMembershipToMembersInput) => {
  if (!membershipId) {
    throw new TRPCError({
      message: "Missing membershipId",
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
  return await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.update({
      where: {
        id: membershipId
      },
      data: {
        members: {
          connect: members.map(member => ({ id: member.id }))
        }
      }
    });

    // Family links only change once the family is paid for
    const isPaidByOwner = members.some((member) => member.id === membershipOwnerId);
    if (membership.type === MembershipType.FAMILY && membershipOwnerId && isPaidByOwner) {
      await linkFamilyMembers(
        membershipOwnerId,
        members.map((member) => member.id),
        tx
      );
    }

    return membership;
  });
}
