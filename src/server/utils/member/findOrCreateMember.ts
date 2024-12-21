import { type z } from "zod";
import { prisma } from "~/server/db";
import { type memberSignupSchema } from "~/utils/zodSchemas";

type FindOrCreateMemberInput = z.infer<typeof memberSignupSchema>;


export async function findOrCreateMember(input: FindOrCreateMemberInput) {
  const membershipPayload = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone
  };
  const existingMember = await prisma.member.findUnique({
    where: { 
      email: membershipPayload.email 
    },
    include: {
      memberships: true
    }
  });

  // If member exists, return it
  if (existingMember) {
    return existingMember;
  }

  // If member doesn't exist, create a new one
  const newMember = await prisma.member.create({
    data: {
      ...membershipPayload,
    },
    include: {
      memberships: true
    }
  });

  return newMember;
}