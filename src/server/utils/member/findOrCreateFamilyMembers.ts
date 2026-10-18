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

type FamilyMembers = Awaited<ReturnType<typeof findOrCreateFamilyMembers>>;

/**
 * Point every family member at the owner. Existing members can still belong to
 * a family from an earlier season, so only call this once the members have been
 * checked against memberships in the current season.
 */
export const linkFamilyMembers = async ([membershipOwner, ...familyMembers]: FamilyMembers) => {
  if (!membershipOwner) {
    return;
  }

  await prisma.$transaction([
    prisma.member.update({
      where: { id: membershipOwner.id },
      data: { familyMemberShipOwnerId: null }
    }),
    prisma.member.updateMany({
      where: { id: { in: familyMembers.map((member) => member.id) } },
      data: { familyMemberShipOwnerId: membershipOwner.id }
    })
  ]);
};
