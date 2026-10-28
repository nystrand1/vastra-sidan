import { type Prisma } from "~/generated/prisma/client";
import { type z } from "zod";
import { prisma } from "~/server/db";
import { type memberSignupSchema } from "~/utils/zodSchemas";

type CreateFamilyMembersInput = z.infer<typeof memberSignupSchema>;

export const findOrCreateFamilyMembers = async (input: CreateFamilyMembersInput) => {
  const membershipOwnerPayload = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone
  };

  const additionalMembers = input.additionalMembers;

  const membershipOwner = await prisma.member.upsert({
    where: {
      email: membershipOwnerPayload.email
    },
    create: {
      ...membershipOwnerPayload,
    },
    update: {},
    include: {
      memberships: true
    }
  });

  const familyMembersPromises = additionalMembers?.map(async (member) => {
    return prisma.member.upsert({
      where: {
        email: member.email
      },
      create: {
        ...member,
        phone: member.phone || membershipOwner.phone,
        familyMemberShipOwnerId: membershipOwner.id
      },
      update: {},
      include: {
        memberships: true
      }
    });
  });

  const familyMembers = await Promise.all(familyMembersPromises || []);

  return [membershipOwner, ...familyMembers];
};

/**
 * Point every family member at the owner. Existing members can still belong to
 * a family from an earlier season, so only call this once the members have been
 * checked against memberships in the current season (and, for public signups,
 * once the payment has succeeded).
 */
export const linkFamilyMembers = async (
  ownerId: string,
  memberIds: string[],
  db: Prisma.TransactionClient = prisma
) => {
  // Emails are matched case-insensitively, so the owner can come back as one of their own family members
  const familyMemberIds = [...new Set(memberIds)].filter((id) => id !== ownerId);

  await db.member.update({
    where: { id: ownerId },
    data: { familyMemberShipOwnerId: null }
  });
  await db.member.updateMany({
    where: { id: { in: familyMemberIds, not: ownerId } },
    data: { familyMemberShipOwnerId: ownerId }
  });
};
